// ─── E2EE Crypto Module ───────────────────────────────────────────────
// Ephemeral ECDH (P-256) key exchange + HKDF-derived AES-256-GCM
// session key for end-to-end encryption of all DataChannel payloads.
//
// SECURITY: Keys are ephemeral per-session and never persisted.
//           The session key is derived with HKDF-SHA256 and a fixed
//           salt, making it deterministic for both peers once they
//           exchange public keys.

export class E2EE {
  private keyPair: CryptoKeyPair | null = null;
  private sessionKey: CryptoKey | null = null;
  private peerPublicKey: CryptoKey | null = null;
  private sendCounter = 0;
  private recvCounter = 0;

  /** Generate an ephemeral ECDH P-256 key pair. Returns the raw public key. */
  async generateKeyPair(): Promise<Uint8Array> {
    this.keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits'],
    );
    const pubKeyBuffer = await crypto.subtle.exportKey('raw', this.keyPair.publicKey);
    return new Uint8Array(pubKeyBuffer);
  }

  /** Import the peer's raw public key. */
  async setPeerPublicKey(pubKeyBytes: Uint8Array): Promise<void> {
    this.peerPublicKey = await crypto.subtle.importKey(
      'raw',
      pubKeyBytes as unknown as BufferSource,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
  }

  /** Derive the shared AES-256-GCM session key via ECDH + HKDF. */
  async deriveSessionKey(salt = 'lemon-drop-salt'): Promise<void> {
    if (!this.keyPair || !this.peerPublicKey) {
      throw new Error('E2EE: keys not ready for derivation');
    }

    const encoder = new TextEncoder();
    const saltBytes = encoder.encode(salt);

    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: this.peerPublicKey },
      this.keyPair.privateKey,
      256,
    );

    const hkdfKey = await crypto.subtle.importKey('raw', derivedBits, { name: 'HKDF' }, false, [
      'deriveKey',
    ]);

    this.sessionKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: saltBytes as unknown as BufferSource,
        info: encoder.encode('e2ee-aes-gcm-key') as unknown as BufferSource,
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  /** Build a deterministic 12-byte nonce from a counter value. */
  private getNonce(counter: number): Uint8Array {
    const nonce = new ArrayBuffer(12);
    const view = new DataView(nonce);
    // Place the counter in the last 8 bytes (little-endian)
    view.setBigUint64(4, BigInt(counter), true);
    return new Uint8Array(nonce);
  }

  /**
   * Encrypt a plaintext chunk with AES-256-GCM.
   * @param payload  - plaintext bytes
   * @param aad      - additional authenticated data (the 14-byte header)
   * @returns ciphertext including the 16-byte GCM tag
   */
  async encryptChunk(payload: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
    if (!this.sessionKey) throw new Error('E2EE: session key not derived');
    const nonce = this.getNonce(this.sendCounter++);
    const cipherText = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce as unknown as BufferSource,
        additionalData: aad as unknown as BufferSource,
        tagLength: 128,
      },
      this.sessionKey,
      payload as unknown as BufferSource,
    );
    return new Uint8Array(cipherText);
  }

  /**
   * Decrypt a ciphertext chunk with AES-256-GCM.
   * @param cipherText      - encrypted bytes (includes GCM tag)
   * @param aad             - the header bytes used as AAD during encryption
   * @param expectedCounter - the expected sequence counter for nonce derivation
   * @returns plaintext bytes
   */
  async decryptChunk(
    cipherText: Uint8Array,
    aad: Uint8Array,
    expectedCounter: number,
  ): Promise<Uint8Array> {
    if (!this.sessionKey) throw new Error('E2EE: session key not derived');
    const nonce = this.getNonce(expectedCounter);
    const plainText = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce as unknown as BufferSource,
        additionalData: aad as unknown as BufferSource,
        tagLength: 128,
      },
      this.sessionKey,
      cipherText as unknown as BufferSource,
    );
    this.recvCounter++;
    return new Uint8Array(plainText);
  }

  /** Reset counters (for reuse safety — generally you should create a new E2EE per session). */
  reset(): void {
    this.sendCounter = 0;
    this.recvCounter = 0;
    this.sessionKey = null;
    this.peerPublicKey = null;
    this.keyPair = null;
  }
}
