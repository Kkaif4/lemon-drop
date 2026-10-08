class E2EE {
  constructor() {
    this.keyPair = null;
    this.sessionKey = null;
    this.peerPublicKey = null;
    this.sendCounter = 0;
    this.recvCounter = 0;
  }

  async generateKeyPair() {
    this.keyPair = await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );
    const pubKeyBuffer = await window.crypto.subtle.exportKey("raw", this.keyPair.publicKey);
    return new Uint8Array(pubKeyBuffer);
  }

  async setPeerPublicKey(pubKeyUint8) {
    this.peerPublicKey = await window.crypto.subtle.importKey(
      "raw",
      pubKeyUint8,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      []
    );
  }

  async deriveSessionKey(saltStr = "lemon-drop-salt") {
    if (!this.keyPair || !this.peerPublicKey) throw new Error("Keys not ready");

    const encoder = new TextEncoder();
    const salt = encoder.encode(saltStr);

    const derivedBits = await window.crypto.subtle.deriveBits(
      { name: "ECDH", public: this.peerPublicKey },
      this.keyPair.privateKey,
      256
    );

    const hkdfKey = await window.crypto.subtle.importKey(
      "raw",
      derivedBits,
      { name: "HKDF" },
      false,
      ["deriveKey"]
    );

    this.sessionKey = await window.crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: salt,
        info: encoder.encode("e2ee-aes-gcm-key"),
      },
      hkdfKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // 12-byte nonce (96 bits)
  _getNonce(counter) {
    const nonce = new ArrayBuffer(12);
    const view = new DataView(nonce);
    view.setBigUint64(4, BigInt(counter), true);
    return new Uint8Array(nonce);
  }

  async encryptChunk(payloadUint8, aadUint8) {
    if (!this.sessionKey) throw new Error("Session key not derived");
    
    const nonce = this._getNonce(this.sendCounter++);
    
    const cipherText = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: aadUint8,
        tagLength: 128
      },
      this.sessionKey,
      payloadUint8
    );
    
    return new Uint8Array(cipherText);
  }

  async decryptChunk(cipherTextUint8, aadUint8, expectedCounter) {
    if (!this.sessionKey) throw new Error("Session key not derived");
    
    const nonce = this._getNonce(expectedCounter);
    
    const plainText = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: aadUint8,
        tagLength: 128
      },
      this.sessionKey,
      cipherTextUint8
    );
    
    this.recvCounter++;
    return new Uint8Array(plainText);
  }
}
