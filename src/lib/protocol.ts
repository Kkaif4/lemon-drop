// ─── Binary Protocol Helpers ──────────────────────────────────────────
// Builders and parsers for the 14-byte binary header used on every
// WebRTC DataChannel packet.
//
// Wire format (14 bytes):
//   [0]      version   u8        always 0x01
//   [1]      type      u8        1=Data, 2=EOF, 3=Metadata, 4=Ready, 5=Reject
//   [2..9]   seq       u64 LE    monotonically increasing (0 for Metadata)
//   [10..13] crc32     u32 LE    IEEE 802.3 CRC of the plaintext chunk

import { HEADER_SIZE, PROTOCOL_VERSION, type PacketTypeValue } from '@/types/transfer';

/** Parsed representation of a 14-byte packet header. */
export interface ParsedHeader {
  version: number;
  type: PacketTypeValue;
  seq: bigint;
  crc: number;
}

/**
 * Build a 14-byte binary header.
 */
export function buildHeader(
  type: PacketTypeValue,
  seq: bigint,
  crc: number,
): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_SIZE);
  const view = new DataView(buf);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, type);
  view.setBigUint64(2, seq, true);
  view.setUint32(10, crc, true);
  return buf;
}

/**
 * Parse the first 14 bytes of a DataChannel message into a structured header.
 */
export function parseHeader(data: ArrayBuffer): ParsedHeader {
  const view = new DataView(data);
  return {
    version: view.getUint8(0),
    type: view.getUint8(1) as PacketTypeValue,
    seq: view.getBigUint64(2, true),
    crc: view.getUint32(10, true),
  };
}

/**
 * Build a complete packet: header + encrypted payload.
 */
export function buildPacket(header: ArrayBuffer, encryptedPayload: Uint8Array): ArrayBuffer {
  const packet = new ArrayBuffer(HEADER_SIZE + encryptedPayload.byteLength);
  const out = new Uint8Array(packet);
  out.set(new Uint8Array(header), 0);
  out.set(encryptedPayload, HEADER_SIZE);
  return packet;
}

/**
 * Build a control-only packet (Ready / Reject / EOF) with no payload.
 */
export function buildControlPacket(type: PacketTypeValue, seq: bigint = 0n): ArrayBuffer {
  return buildHeader(type, seq, 0);
}
