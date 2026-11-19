// ─── Transfer Protocol Types ──────────────────────────────────────────
// Binary framing and transfer state types for the WebRTC DataChannel.

/** Packet type identifiers embedded in byte offset 1 of every frame. */
export const PacketType = {
  DATA:     1,
  EOF:      2,
  METADATA: 3,
  READY:    4,
  REJECT:   5,
  ACK:      6,
  RESIZE:   7,
} as const;

export type PacketTypeValue = (typeof PacketType)[keyof typeof PacketType];

/** Binary header is exactly 14 bytes:
 *  [0]      version   u8
 *  [1]      type      u8
 *  [2..9]   seq       u64 LE
 *  [10..13] crc32     u32 LE
 */
export const HEADER_SIZE = 14;

/** Chunk size tiers (plaintext payload, excluding 16-byte AES-GCM tag) */
export const MIN_CHUNK_SIZE = 16 * 1024 - 16;       // Tier 1: 16 KB (Safe baseline)
export const STANDARD_CHUNK_SIZE = 64 * 1024 - 16;  // Tier 2: 64 KB (Balanced)
export const FAST_CHUNK_SIZE = 128 * 1024 - 16;     // Tier 3: 128 KB (High-speed)
export const MAX_CHUNK_SIZE = 256 * 1024 - 16;      // Tier 4: 256 KB (Ultra/LAN)

export const CHUNK_TIERS = [
  MIN_CHUNK_SIZE,
  STANDARD_CHUNK_SIZE,
  FAST_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
] as const;

/** Default starting chunk size (Tier 1 safe baseline) */
export const CHUNK_SIZE = MIN_CHUNK_SIZE;

/** Protocol version */
export const PROTOCOL_VERSION = 1;

/** Telemetry feedback payload sent by receiver in ACK packet (Type 6). */
export interface TelemetryAckPayload {
  ackedSeq: number;
  recvBytes: number;
  writeLatencyMs: number;
  bufferPressure: 'low' | 'medium' | 'high';
  timestamp: number;
}

/** Real-time diagnostic metrics surfaced to UI. */
export interface TransferDiagnostics {
  chunkSize: number;
  tierIndex: number;
  tierName: 'Safe' | 'Standard' | 'Fast' | 'Ultra';
  rttMs: number;
  bottleneck: 'network' | 'disk' | 'cpu' | 'optimal';
  bufferPressure: 'low' | 'medium' | 'high';
}

/** File metadata sent as the payload of a METADATA packet. */
export interface FileMetadata {
  name: string;
  size: number;
}

/** Overall transfer state visible to UI components. */
export type TransferState =
  | 'idle'
  | 'connecting'
  | 'waiting-for-peer'
  | 'peer-connected'
  | 'waiting-for-acceptance'
  | 'transferring'
  | 'completed'
  | 'error'
  | 'rejected';

/** Live transfer statistics. */
export interface TransferStats {
  bytesTransferred: number;
  totalBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  percentage: number;
  diagnostics?: TransferDiagnostics;
}

/** Connection quality info surfaced to UI. */
export type ConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';
