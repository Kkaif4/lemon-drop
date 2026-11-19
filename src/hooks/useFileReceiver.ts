// ─── useFileReceiver Hook ─────────────────────────────────────────────
// Handles incoming WebRTC DataChannel messages, sequential decryption,
// CRC verification, and direct-to-disk streaming via File System
// Access API or resilient fallback.

'use client';

import { useCallback, useRef, useState } from 'react';
import { E2EE } from '@/lib/crypto';
import { crc32 } from '@/lib/crc32';
import { parseHeader, buildControlPacket, buildAckPacket } from '@/lib/protocol';
import {
  PacketType,
  HEADER_SIZE,
  type TransferState,
  type TransferStats,
  type FileMetadata,
} from '@/types/transfer';
import {
  type DiskWriter,
  supportsNativeFilePicker,
  openNativeFileWriter,
  openFallbackFileWriter,
} from '@/lib/storage';

interface UseFileReceiverArgs {
  dataChannel: RTCDataChannel | null;
  e2ee: E2EE;
}

interface UseFileReceiverReturn {
  transferState: TransferState;
  stats: TransferStats;
  fileMetadata: FileMetadata | null;
  errorMessage: string | null;
  usedNativePicker: boolean;
  acceptTransfer: () => Promise<void>;
  rejectTransfer: () => void;
  cancelTransfer: () => void;
  resetTransfer: () => void;
  handleIncomingData: (data: ArrayBuffer) => void;
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usedNativePicker, setUsedNativePicker] = useState(false);

  const writerRef = useRef<DiskWriter | null>(null);
  const fallbackDownloadRef = useRef<(() => Promise<void>) | null>(null);
  const expectedSeqRef = useRef(0n);
  const totalReceivedRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastUpdateTimeRef = useRef(0);
  const lastUpdateOffsetRef = useRef(0);
  const fileSizeRef = useRef(0);
  const fileNameRef = useRef('received_file');
  const lastAckOffsetRef = useRef(0);
  const lastAckTimeRef = useRef(0);

  // Async message queue for sequential chunk processing
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

  const handleIncomingData = useCallback(
    (data: ArrayBuffer) => {
      queueRef.current.push(data);
      processQueue();
    },
    [processQueue],
  );

  const processChunk = async (data: ArrayBuffer) => {
    const header = parseHeader(data);

    // ── METADATA (type 3) ──────────────────────────────────
    if (header.type === PacketType.METADATA) {
      const headerBytes = new Uint8Array(data, 0, HEADER_SIZE);
      const cipherText = new Uint8Array(data, HEADER_SIZE);
      try {
        const plainText = await e2ee.decryptChunk(cipherText, headerBytes, 0);
        const meta: FileMetadata = JSON.parse(new TextDecoder().decode(plainText));

        // Clean up previous file writer if open
        if (writerRef.current) {
          try {
            await writerRef.current.close();
          } catch {
            // ignore
          }
          writerRef.current = null;
        }
        fallbackDownloadRef.current = null;
        totalReceivedRef.current = 0;
        setStats(INITIAL_STATS);

        setFileMetadata(meta);
        fileSizeRef.current = meta.size;
        fileNameRef.current = meta.name;
        expectedSeqRef.current = 1n;
        setErrorMessage(null);
        setTransferState('waiting-for-acceptance');
      } catch (err: any) {
        console.error('[Receiver] Failed to decrypt/parse metadata:', err);
        setErrorMessage('Failed to decrypt incoming file metadata.');
        setTransferState('error');
      }
      return;
    }

    // ── REJECT / CANCEL (type 5) ───────────────────────────
    if (header.type === PacketType.REJECT) {
      if (writerRef.current) {
        try {
          await writerRef.current.close();
        } catch {
          // ignore
        }
        writerRef.current = null;
      }
      fallbackDownloadRef.current = null;
      setTransferState('rejected');
      setErrorMessage('Transfer was cancelled by peer.');
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

        const computedCrc = crc32(plainText);
        if (header.crc !== computedCrc) {
          console.error(
            `[Receiver] CRC mismatch on seq ${header.seq}: expected ${header.crc}, got ${computedCrc}`,
          );
          return;
        }

        let writeLatency = 0;
        if (writerRef.current) {
          const writeStart = performance.now();
          await writerRef.current.write(plainText);
          writeLatency = performance.now() - writeStart;
        }

        totalReceivedRef.current += plainText.length;
        expectedSeqRef.current++;

        // Send telemetry feedback ACK every 1.5 MB (or every 32 chunks)
        const bytesSinceLastAck = totalReceivedRef.current - lastAckOffsetRef.current;
        if (bytesSinceLastAck >= 1.5 * 1024 * 1024 || header.seq % 32n === 0n) {
          const pressure: 'low' | 'medium' | 'high' =
            queueRef.current.length > 8 || writeLatency > 35
              ? 'high'
              : queueRef.current.length > 3 || writeLatency > 15
                ? 'medium'
                : 'low';

          const ackPacket = buildAckPacket({
            ackedSeq: Number(header.seq),
            recvBytes: totalReceivedRef.current,
            writeLatencyMs: Math.round(writeLatency * 10) / 10,
            bufferPressure: pressure,
            timestamp: performance.now(),
          });

          if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(ackPacket);
          }

          lastAckOffsetRef.current = totalReceivedRef.current;
          lastAckTimeRef.current = performance.now();
        }

        const now = performance.now();
        const totalBytes = fileSizeRef.current;
        const received = totalReceivedRef.current;

        if (now - lastUpdateTimeRef.current > 250) {
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
   * Accept the transfer.
   * If native picker is cancelled by user (AbortError), it sends REJECT.
   * If native picker fails due to any other error or permission issue,
   * it gracefully switches to the fallback stream rather than aborting.
   */
  const acceptTransfer = useCallback(async () => {
    const dc = dataChannel;
    if (!dc || dc.readyState !== 'open') return;

    try {
      let writer: DiskWriter | null = null;

      if (supportsNativeFilePicker()) {
        try {
          writer = await openNativeFileWriter(fileNameRef.current);
          setUsedNativePicker(true);
        } catch (pickerErr: any) {
          // If the user deliberately clicked Cancel in the dialog
          if (pickerErr?.name === 'AbortError') {
            console.log('[Receiver] User canceled file picker dialog.');
            setTransferState('rejected');
            const rejectPacket = buildControlPacket(PacketType.REJECT);
            dc.send(rejectPacket);
            return;
          }
          // If native picker had permission or sandbox issues, fallback seamlessly
          console.warn('[Receiver] Native picker error, switching to fallback writer:', pickerErr);
          const fallback = await openFallbackFileWriter(fileNameRef.current);
          writer = fallback;
          fallbackDownloadRef.current = fallback.triggerDownload.bind(fallback);
          setUsedNativePicker(false);
        }
      } else {
        const fallback = await openFallbackFileWriter(fileNameRef.current);
        writer = fallback;
        fallbackDownloadRef.current = fallback.triggerDownload.bind(fallback);
        setUsedNativePicker(false);
      }

      writerRef.current = writer;

      // Reset counters
      totalReceivedRef.current = 0;
      lastAckOffsetRef.current = 0;
      startTimeRef.current = performance.now();
      lastUpdateTimeRef.current = performance.now();
      lastUpdateOffsetRef.current = 0;

      // Send READY signal (type 4) to sender
      const readyPacket = buildControlPacket(PacketType.READY);
      dc.send(readyPacket);

      setTransferState('transferring');
      setStats({
        ...INITIAL_STATS,
        totalBytes: fileSizeRef.current,
      });
    } catch (err: any) {
      console.error('[Receiver] Storage initiation error:', err);
      setErrorMessage(err?.message || 'Failed to initialize storage.');
      setTransferState('error');

      const rejectPacket = buildControlPacket(PacketType.REJECT);
      dc.send(rejectPacket);
    }
  }, [dataChannel]);

  const rejectTransfer = useCallback(() => {
    const dc = dataChannel;
    if (dc && dc.readyState === 'open') {
      const rejectPacket = buildControlPacket(PacketType.REJECT);
      dc.send(rejectPacket);
    }
    setTransferState('rejected');
  }, [dataChannel]);

  const resetTransfer = useCallback(() => {
    if (writerRef.current) {
      try {
        writerRef.current.close();
      } catch {
        // ignore
      }
      writerRef.current = null;
    }
    fallbackDownloadRef.current = null;
    setTransferState('idle');
    setFileMetadata(null);
    setErrorMessage(null);
    setStats(INITIAL_STATS);
    queueRef.current = [];
    lastAckOffsetRef.current = 0;
  }, []);

  const triggerFallbackDownload = useCallback(async () => {
    if (fallbackDownloadRef.current) {
      await fallbackDownloadRef.current();
    }
  }, []);

  return {
    transferState,
    stats,
    fileMetadata,
    errorMessage,
    usedNativePicker,
    acceptTransfer,
    rejectTransfer,
    cancelTransfer: rejectTransfer,
    resetTransfer,
    handleIncomingData,
    triggerFallbackDownload,
  };
}
