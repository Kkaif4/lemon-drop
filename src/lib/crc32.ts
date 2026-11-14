// ─── CRC32 (IEEE 802.3) ───────────────────────────────────────────────
// Pre-computed lookup table for fast CRC32 checksums on chunk payloads.

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

/**
 * Compute IEEE 802.3 CRC32 of a Uint8Array.
 * Returns an unsigned 32-bit integer.
 */
export function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
