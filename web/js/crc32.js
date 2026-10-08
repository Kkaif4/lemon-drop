// Simple CRC32 implementation
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i++) {
    crc = crcTable[(crc ^ view[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
