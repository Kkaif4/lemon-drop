// ─── useFileSender Hook ───────────────────────────────────────────────
// Orchestrates file chunking, encryption, and transmission over a
// WebRTC DataChannel with backpressure handling.
//
// Flow:
//   1. User selects a file
//   2. User clicks "Start Transfer" → sends Metadata packet (type 3)
//   3. Sender PAUSES and waits for Ready (type 4) from receiver
//   4. On Ready, begins streaming encrypted chunks (type 1) with
//      backpressure checks on bufferedAmount
//   5. After all chunks, sends EOF (type 2)

'use client';

import { useCallback, useRef, useState } from 'react';
import { E2EE } from '@/lib/crypto';
import { crc32 } from '@/lib/crc32';
import { buildHeader, buildPacket, buildControlPacket, parseAckPayload } from '@/lib/protocol';
import { AdaptivePacketSizer } from '@/lib/adaptiveSizer';
import {
  PacketType,
  type TransferState,
  type TransferStats,
} from '@/types/transfer';

interface UseFileSenderArgs {
  dataChannel: RTCDataChannel | null;
  e2ee: E2EE;
}

interface UseFileSenderReturn {
  selectedFile: File | null;
  transferState: TransferState;
  stats: TransferStats;
  selectFile: (file: File) => void;
  resetTransfer: () => void;
  cancelTransfer: () => void;
  startTransfer: () => Promise<void>;
  handleIncomingControl: (data: ArrayBuffer) => void;
}

const INITIAL_STATS: TransferStats = {
  bytesTransferred: 0,
  totalBytes: 0,
  speedBytesPerSec: 0,
  etaSeconds: Infinity,
  percentage: 0,
};

export function useFileSender({ dataChannel, e2ee }: UseFileSenderArgs): UseFileSenderReturn {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transferState, setTransferState] = useState<TransferState>('idle');
  const [stats, setStats] = useState<TransferStats>(INITIAL_STATS);

  // Mutable refs for transfer loop (avoid stale closures)
  const fileRef = useRef<File | null>(null);
  const offsetRef = useRef(0);
  const seqRef = useRef(1n);
  const startTimeRef = useRef(0);
  const lastUpdateTimeRef = useRef(0);
  const lastUpdateOffsetRef = useRef(0);
  const sizerRef = useRef(new AdaptivePacketSizer());
  const isCancelledRef = useRef(false);

  const resetTransfer = useCallback(() => {
    isCancelledRef.current = false;
    setSelectedFile(null);
    fileRef.current = null;
    offsetRef.current = 0;
    seqRef.current = 1n;
    sizerRef.current.reset();
    setTransferState('idle');
    setStats(INITIAL_STATS);
  }, []);

  const selectFile = useCallback((file: File) => {
    isCancelledRef.current = false;
    setSelectedFile(file);
    fileRef.current = file;
    offsetRef.current = 0;
    seqRef.current = 1n;
    sizerRef.current.reset();
    setTransferState('idle');
    setStats(INITIAL_STATS);
  }, []);

  const cancelTransfer = useCallback(() => {
    isCancelledRef.current = true;
    const dc = dataChannel;
    if (dc && dc.readyState === 'open') {
      try {
        const rejectPacket = buildControlPacket(PacketType.REJECT);
        dc.send(rejectPacket);
      } catch {
        // ignore
      }
    }
    setTransferState('rejected');
  }, [dataChannel]);

  /**
   * Send the Metadata packet and wait for the receiver to accept.
   */
  const startTransfer = useCallback(async () => {
    isCancelledRef.current = false;
    const file = fileRef.current;
    const dc = dataChannel;
    if (!file || !dc || dc.readyState !== 'open') return;

    setTransferState('waiting-for-acceptance');

    // Build metadata JSON payload
    const metaStr = JSON.stringify({ name: file.name, size: file.size });
    const metaPayload = new TextEncoder().encode(metaStr);

    // Build header (type=3 METADATA, seq=0)
    const headerBuf = buildHeader(PacketType.METADATA, 0n, crc32(metaPayload));
    const headerBytes = new Uint8Array(headerBuf);

    // Encrypt metadata
    const cipherMeta = await e2ee.encryptChunk(metaPayload, headerBytes);

    // Build and send the complete packet
    const packet = buildPacket(headerBuf, cipherMeta);
    dc.send(packet);
  }, [dataChannel, e2ee]);

  /**
   * Handle control packets from the receiver (Ready / Reject / ACK).
   */
  const handleIncomingControl = useCallback(
    (data: ArrayBuffer) => {
      const view = new DataView(data);
      const type = view.getUint8(1);

      if (type === PacketType.READY) {
        setTransferState('transferring');
        offsetRef.current = 0;
        seqRef.current = 1n;
        sizerRef.current.reset();
        startTimeRef.current = performance.now();
        lastUpdateTimeRef.current = performance.now();
        lastUpdateOffsetRef.current = 0;
        setStats({
          ...INITIAL_STATS,
          totalBytes: fileRef.current?.size ?? 0,
          diagnostics: sizerRef.current.getDiagnostics(),
        });
        // Configure continuous low-threshold buffer for smooth streaming
        if (dataChannel) {
          dataChannel.bufferedAmountLowThreshold = 512 * 1024; // 512 KB
        }
        // Begin sending chunks
        sendNextChunk();
      } else if (type === PacketType.REJECT) {
        isCancelledRef.current = true;
        setTransferState('rejected');
      } else if (type === PacketType.ACK) {
        const ack = parseAckPayload(data);
        if (ack) {
          sizerRef.current.onAckReceived(ack);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataChannel, e2ee],
  );

  /**
   * Read the next chunk from the file, encrypt it, and send it.
   * Uses dynamic chunk sizing (16 KB - 256 KB) + continuous dual-threshold backpressure.
   */
  const sendNextChunk = useCallback(async () => {
    if (isCancelledRef.current) return;
    const file = fileRef.current;
    const dc = dataChannel;
    if (!file || !dc || dc.readyState !== 'open') return;

    if (offsetRef.current >= file.size) {
      // All chunks sent — send EOF
      const eofPacket = buildControlPacket(PacketType.EOF, seqRef.current);
      dc.send(eofPacket);
      setTransferState('completed');
      setStats((prev) => ({
        ...prev,
        percentage: 100,
        bytesTransferred: file.size,
        diagnostics: sizerRef.current.getDiagnostics(),
      }));
      return;
    }

    // Dynamic chunk payload size from adaptive sizer
    const currentChunkSize = sizerRef.current.getChunkSize();
    const end = Math.min(offsetRef.current + currentChunkSize, file.size);
    const slice = file.slice(offsetRef.current, end);
    const arrayBuffer = await slice.arrayBuffer();
    const payload = new Uint8Array(arrayBuffer);

    // Build header
    const headerBuf = buildHeader(PacketType.DATA, seqRef.current, crc32(payload));
    const headerBytes = new Uint8Array(headerBuf);

    // Encrypt
    const cipherText = await e2ee.encryptChunk(payload, headerBytes);

    // Continuous Dual-Threshold Backpressure:
    // High-Water Mark: 1.5 MB. If exceeded, wait for bufferedamountlow (512 KB)
    if (dc.bufferedAmount > 1.5 * 1024 * 1024) {
      const preDrainAmount = dc.bufferedAmount;
      const drainStart = performance.now();
      await new Promise<void>((resolve) => {
        dc.addEventListener('bufferedamountlow', () => resolve(), { once: true });
      });
      const drainTime = performance.now() - drainStart;
      sizerRef.current.onBufferDrain(drainTime, Math.max(0, preDrainAmount - dc.bufferedAmount));
    }

    // Send packet
    const packet = buildPacket(headerBuf, cipherText);
    dc.send(packet);

    offsetRef.current = end;
    seqRef.current++;

    // Update stats throttled to every 250ms
    const now = performance.now();
    if (now - lastUpdateTimeRef.current > 250) {
      const elapsedSinceLast = (now - lastUpdateTimeRef.current) / 1000;
      const bytesSinceLast = offsetRef.current - lastUpdateOffsetRef.current;
      const speed = bytesSinceLast / elapsedSinceLast;
      const remaining = file.size - offsetRef.current;
      const eta = speed > 0 ? remaining / speed : Infinity;

      setStats({
        bytesTransferred: offsetRef.current,
        totalBytes: file.size,
        speedBytesPerSec: speed,
        etaSeconds: eta,
        percentage: (offsetRef.current / file.size) * 100,
        diagnostics: sizerRef.current.getDiagnostics(),
      });

      lastUpdateTimeRef.current = now;
      lastUpdateOffsetRef.current = offsetRef.current;
    }

    // Yield smoothly to the event loop
    setTimeout(() => sendNextChunk(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataChannel, e2ee]);

  return {
    selectedFile,
    transferState,
    stats,
    selectFile,
    resetTransfer,
    cancelTransfer,
    startTransfer,
    handleIncomingControl,
  };
}
