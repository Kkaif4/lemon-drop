// ─── useFileReceiver Hook ─────────────────────────────────────────────
// Handles incoming WebRTC DataChannel messages, sequential decryption,
// CRC verification, and direct-to-disk streaming via File System
// Access API or OPFS fallback.
//
// CRITICAL DESIGN DECISION — Sequential Async Message Queue:
//   WebRTC's onmessage fires synchronously for every chunk, but
//   AES-GCM decryption is asynchronous. Without a queue, chunk N+1
//   arrives and tries to decrypt while chunk N is still being
//   decrypted, causing sequence counter mismatches and corrupted files.
//
//   The queue ensures chunks are processed strictly in order:
//   onmessage → push to queue → processQueue() drains FIFO one-by-one.

'use client';

import { useCallback, useRef, useState } from 'react';
import { E2EE } from '@/lib/crypto';
import { crc32 } from '@/lib/crc32';
import { parseHeader, buildControlPacket } from '@/lib/protocol';
import { PacketType, HEADER_SIZE, type TransferState, type TransferStats, type FileMetadata } from '@/types/transfer';
import {
  type DiskWriter,
  supportsNativeFilePicker,
  openNativeFileWriter,
  openOPFSFileWriter,
} from '@/lib/storage';

interface UseFileReceiverArgs {
  dataChannel: RTCDataChannel | null;
  e2ee: E2EE;
}

interface UseFileReceiverReturn {
  transferState: TransferState;
  stats: TransferStats;
  fileMetadata: FileMetadata | null;
  /** Whether we used the native file picker (or fell back to OPFS) */
  usedNativePicker: boolean;
  /** Call this from a button click (user gesture!) to accept the transfer */
  acceptTransfer: () => Promise<void>;
  /** Call this to reject the transfer */
  rejectTransfer: () => void;
  /** Feed incoming DataChannel messages to this handler */
  handleIncomingData: (data: ArrayBuffer) => void;
  /** For OPFS fallback — trigger the download after transfer completes */
  triggerFallbackDownload: () => Promise<void>;
}

const INITIAL_STATS: TransferStats = {
  bytesTransferred: 0,
  totalBytes: 0,
  speedBytesPerSec: 0,
  etaSeconds: Infinity,
  percentage: 0,
};

export function useFileReceiver({ dataChannel, e2ee }: UseFileReceiverArgs): UseFileReceiverReturn {
  const [transferState, setTransferState] = useState<TransferState>('idle');
  const [stats, setStats] = useState<TransferStats>(INITIAL_STATS);
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null);
  const [usedNativePicker, setUsedNativePicker] = useState(false);

  // Mutable refs for the hot loop
  const writerRef = useRef<DiskWriter | null>(null);
  const opfsDownloadRef = useRef<(() => Promise<void>) | null>(null);
  const expectedSeqRef = useRef(0n);
  const totalReceivedRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastUpdateTimeRef = useRef(0);
  const lastUpdateOffsetRef = useRef(0);
  const fileSizeRef = useRef(0);
  const fileNameRef = useRef('received_file');

  // ── Async Message Queue ──────────────────────────────────
  const queueRef = useRef<ArrayBuffer[]>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const data = queueRef.current.shift()!;
      await processChunk(data);
    }

    processingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Entry point for all incoming DataChannel messages.
   * Pushes to the async queue and kicks processing.
   */
  const handleIncomingData = useCallback(
    (data: ArrayBuffer) => {
      queueRef.current.push(data);
      processQueue();
    },
    [processQueue],
  );

  /**
   * Process a single chunk from the queue.
   */
  const processChunk = async (data: ArrayBuffer) => {
    const header = parseHeader(data);

    // ── METADATA (type 3) ──────────────────────────────────
    if (header.type === PacketType.METADATA) {
      const headerBytes = new Uint8Array(data, 0, HEADER_SIZE);
      const cipherText = new Uint8Array(data, HEADER_SIZE);
      try {
        const plainText = await e2ee.decryptChunk(cipherText, headerBytes, 0);
        const meta: FileMetadata = JSON.parse(new TextDecoder().decode(plainText));
        setFileMetadata(meta);
        fileSizeRef.current = meta.size;
        fileNameRef.current = meta.name;
        expectedSeqRef.current = 1n;
        setTransferState('waiting-for-acceptance');
      } catch (err) {
        console.error('[Receiver] Failed to decrypt/parse metadata:', err);
        setTransferState('error');
      }
      return;
    }

    // ── EOF (type 2) ───────────────────────────────────────
    if (header.type === PacketType.EOF) {
      setTransferState('completed');
      setStats((prev) => ({
        ...prev,
        percentage: 100,
        bytesTransferred: fileSizeRef.current,
      }));

      // Close the disk writer
      if (writerRef.current) {
        await writerRef.current.close();
      }
      return;
    }

    // ── DATA (type 1) ──────────────────────────────────────
    if (header.type === PacketType.DATA) {
      if (header.seq !== expectedSeqRef.current) {
        console.error(
          `[Receiver] Sequence mismatch: expected ${expectedSeqRef.current}, got ${header.seq}`,
        );
        return;
      }

      const headerBytes = new Uint8Array(data, 0, HEADER_SIZE);
      const cipherText = new Uint8Array(data, HEADER_SIZE);

      try {
        const plainText = await e2ee.decryptChunk(cipherText, headerBytes, Number(header.seq));

        // Verify CRC32
        const computedCrc = crc32(plainText);
        if (header.crc !== computedCrc) {
          console.error(
            `[Receiver] CRC mismatch on seq ${header.seq}: expected ${header.crc}, got ${computedCrc}`,
          );
          return;
        }

        // Write to disk
        if (writerRef.current) {
          await writerRef.current.write(plainText);
        }

        totalReceivedRef.current += plainText.length;
        expectedSeqRef.current++;

        // Update stats (throttled)
        const now = performance.now();
        const totalBytes = fileSizeRef.current;
        const received = totalReceivedRef.current;

        if (now - lastUpdateTimeRef.current > 500) {
          const elapsed = (now - lastUpdateTimeRef.current) / 1000;
          const bytesSince = received - lastUpdateOffsetRef.current;
          const speed = bytesSince / elapsed;
          const remaining = totalBytes - received;
          const eta = speed > 0 ? remaining / speed : Infinity;

          setStats({
            bytesTransferred: received,
            totalBytes,
            speedBytesPerSec: speed,
            etaSeconds: eta,
            percentage: totalBytes > 0 ? (received / totalBytes) * 100 : 0,
          });

          lastUpdateTimeRef.current = now;
          lastUpdateOffsetRef.current = received;
        }
      } catch (err) {
        console.error(`[Receiver] Decryption failed for seq ${header.seq}:`, err);
      }
    }
  };

  /**
   * Accept the file transfer — opens the File System Access dialog.
   * MUST be called from a user gesture (button click).
   */
  const acceptTransfer = useCallback(async () => {
    const dc = dataChannel;
    if (!dc || dc.readyState !== 'open') return;

    try {
      if (supportsNativeFilePicker()) {
        const writer = await openNativeFileWriter(fileNameRef.current);
        writerRef.current = writer;
        setUsedNativePicker(true);
      } else {
        const writer = await openOPFSFileWriter(fileNameRef.current);
        writerRef.current = writer;
        opfsDownloadRef.current = writer.triggerDownload.bind(writer);
        setUsedNativePicker(false);
      }

      // Reset counters
      totalReceivedRef.current = 0;
      startTimeRef.current = performance.now();
      lastUpdateTimeRef.current = performance.now();
      lastUpdateOffsetRef.current = 0;

      // Send READY signal (type 4)
      const readyPacket = buildControlPacket(PacketType.READY);
      dc.send(readyPacket);

      setTransferState('transferring');
      setStats({
        ...INITIAL_STATS,
        totalBytes: fileSizeRef.current,
      });
    } catch (err) {
      console.error('[Receiver] File access denied or canceled:', err);
      setTransferState('error');

      // Send REJECT signal (type 5)
      const rejectPacket = buildControlPacket(PacketType.REJECT);
      dc.send(rejectPacket);
    }
  }, [dataChannel]);

  /**
   * Reject the file transfer.
   */
  const rejectTransfer = useCallback(() => {
    const dc = dataChannel;
    if (!dc || dc.readyState !== 'open') return;

    const rejectPacket = buildControlPacket(PacketType.REJECT);
    dc.send(rejectPacket);
    setTransferState('rejected');
  }, [dataChannel]);

  /**
   * For OPFS fallback: trigger a standard browser download after transfer completes.
   */
  const triggerFallbackDownload = useCallback(async () => {
    if (opfsDownloadRef.current) {
      await opfsDownloadRef.current();
    }
  }, []);

  return {
    transferState,
    stats,
    fileMetadata,
    usedNativePicker,
    acceptTransfer,
    rejectTransfer,
    handleIncomingData,
    triggerFallbackDownload,
  };
}
