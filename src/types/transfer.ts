// ─── Transfer Protocol Types ──────────────────────────────────────────
// Binary framing and transfer state types for the WebRTC DataChannel.

/** Packet type identifiers embedded in byte offset 1 of every frame. */
export const PacketType = {
  DATA:     1,
  EOF:      2,
  METADATA: 3,
  READY:    4,
  REJECT:   5,
} as const;

export type PacketTypeValue = (typeof PacketType)[keyof typeof PacketType];

/** Binary header is exactly 14 bytes:
 *  [0]      version   u8
 *  [1]      type      u8
 *  [2..9]   seq       u64 LE
 *  [10..13] crc32     u32 LE
 */
export const HEADER_SIZE = 14;

/** 16 KB minus 16 bytes for AES-GCM tag = effective plaintext chunk size */
export const CHUNK_SIZE = 16 * 1024 - 16;

/** Protocol version */
export const PROTOCOL_VERSION = 1;

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
}

/** Connection quality info surfaced to UI. */
export type ConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';
