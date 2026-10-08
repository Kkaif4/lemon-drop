# Plan v4: Zero Data Loss and Hardened Security

## 1. What "no data loss" can honestly promise

No system can promise that every transfer _completes_ (the sender's phone can die). What we can promise, and design for:

1. **No silent corruption.** The receiver's final file is byte-identical to the sender's, or the transfer is marked failed.
2. **No partial file ever shown as complete.**
3. **Sender's original file is never modified** (read-only access).
4. **Interrupted transfers resume** from the last _durably saved_ byte, and bad blocks are repaired without a restart.
5. **"Success" appears on both sides only after the receiver has verified the saved file.**

## 2. Integrity design (defense in depth)

| Layer                                     | Protects against                                    | How                                                                                                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reliable, ordered WebRTC channel          | Packet loss and reordering                          | Never use `maxRetransmits` or unordered mode                                                                                                                                                                      |
| **AES-256-GCM per chunk** (section 3)     | Bit flips, tampering, replayed or duplicated chunks | Auth tag per chunk, with `transferId                                                                                                                                                                              | seq` in the AAD |
| **Strict sequence and offset checks**     | Software bugs, gaps                                 | Receiver rejects out-of-order, duplicate, or out-of-range frames                                                                                                                                                  |
| **Block hashes** (every 16-32 MB)         | Memory or logic errors, localized corruption        | Sender sends each block's SHA-256 right after the block. A mismatch triggers `REPAIR(block n)`, which re-sends only that block.                                                                                   |
| **Durable ACKs**                          | Crash mid-write                                     | Receiver ACKs an offset only **after the data is written and flushed to disk**, not when it arrives                                                                                                               |
| **Idempotent writes at explicit offsets** | Retransmits, resume overlap                         | Writing the same chunk twice has no effect                                                                                                                                                                        |
| **Read-back verification**                | Disk write errors, quota failures, storage bugs     | After the last block, the receiver re-reads the _stored_ file and computes SHA-256 against the sender's hash                                                                                                      |
| **Source-stability check**                | File edited or removed mid-send                     | The sender records size and last-modified at the start and rechecks per block and at the end. A change aborts with a clear message.                                                                               |
| **Two-phase finish**                      | False "done" messages                               | Sender sends `FINISH{size, sha256}`. Receiver replies `VERIFIED` or `FAILED/REPAIR`. Sender shows success only on `VERIFIED`.                                                                                     |
| **Temp file until verified**              | Half-written files                                  | Save to a `.part` file in OPFS and expose it only after verification passes. In Chromium, `createWritable()` writes to a temporary swap file and commits on `close()`, so an aborted write leaves nothing behind. |
| **Pre-flight checks**                     | Disk full                                           | Check `navigator.storage.estimate()` against the file size before accepting, and handle `QuotaExceededError` explicitly                                                                                           |

The read-back step adds time, perhaps a minute or two for a large file on a phone (measure it), but it is the only check that covers the disk itself. I'd make it **mandatory**, given your requirement.

**Limits to be upfront about:** if the browser hands the file straight to its own downloader (the service-worker streaming path), you can't read it back. So on those platforms, save to OPFS first, then export, and show the SHA-256 so users can check it themselves.

### Failure cases and outcomes

| Event                                     | Result                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| Network drops or Wi-Fi switches to 4G     | ICE restart, resume from the last durable ACK                                    |
| Receiver tab killed                       | Partial `.part` and offset persist, so it resumes on reopen                      |
| Sender tab closed                         | Receiver keeps the partial file. Sender re-picks the same file and it continues. |
| Block hash mismatch                       | Only that block is re-sent                                                       |
| Disk full                                 | Clean abort, partial deleted, clear message                                      |
| Source file changed mid-send              | Abort. No mixed-version file is produced.                                        |
| Final hash mismatch after repair attempts | Marked **FAILED**, never "saved"                                                 |
| Both devices lost                         | Nothing is corrupted, and the transfer can be restarted later                    |

## 3. Security upgrades

### 3.1 End-to-end encryption that the server can't break

WebRTC already encrypts with DTLS, but a malicious or compromised signaling server could swap the connection fingerprints and sit in the middle. Fix this with an application-layer layer on top:

- The room link is `https://…/r.html#<secret>`. The **fragment is never sent to any server**.
- Both sides do an ephemeral **ECDH (P-256)** exchange and derive keys with **HKDF** using the fragment secret. This gives forward secrecy.
- Bind the session by exchanging an HMAC of both DTLS fingerprints, keyed from that secret. A mismatch aborts the transfer.
- Encrypt every chunk with **AES-256-GCM**. The nonce is a counter (never reused), and the AAD is `transferId|seq|type`.
- Short-code pairing has too little entropy to authenticate. When someone joins by code, **show a short verification string** (for example a 4-digit or 3-emoji code) on both screens and have the sender confirm it matches.
- **Optional password as a second factor:** mix the password into key derivation (Argon2id via WASM, or PBKDF2 in WebCrypto). Then a leaked link alone is useless.

### 3.2 Room and signaling hardening

- Long random link token (≥128 bits). Short codes get strict rate limits and a 10-minute expiry.
- One sender and one receiver, single use. The sender must **accept**.
- **Require the sender to be logged in** to create rooms (owner token, or invite). Receivers join through the link. This stops strangers from using your TURN relay as a free proxy.
- WebSocket **Origin allowlist**, max message size (e.g. 64 KB), per-connection and per-IP rate limits, schema validation (zod) on every message, and heartbeats.
- Don't log SDP or secrets. SDP contains IP addresses.
- Server-side password gate: argon2id, lockout, rate limits.

### 3.3 TURN (coturn) hardening

- `use-auth-secret` with **ephemeral credentials** issued only for valid rooms. Make the TTL cover the transfer time (several hours), because refreshes after expiry can fail. Verify this against your coturn version.
- **Deny relaying to private and internal ranges** (`denied-peer-ip` for 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, `::1`, `fc00::/7`), so nobody can use your relay to probe your internal network.
- `no-multicast-peers`, `no-cli`, TLS certificates, per-user and total bandwidth quotas.
- Firewall to only the ports you need, and keep the OS auto-updated.

### 3.4 What the receiver is protected from

Without a server scan, the defence is **informing and constraining**:

- Show sender name, file name, size, and type, with an **Accept/Decline** step. Mark everything **"not scanned"**.
- **Sanitize filenames:** strip path separators, control characters, the right-to-left override `U+202E`, reserved Windows names, and overlong names. Render with `textContent`, never `innerHTML`.
- Warn on risky extensions (`.msi .bat .scr .lnk .js .jar .iso` and macro-enabled Office files). Never auto-open anything.
- **Trusted devices:** after the first pairing, store a device identity key (IndexedDB) and show a "trusted device" badge on later transfers, so your own phone and laptop are recognizable.
- Recommend scanning the saved file with the device's own antivirus.

### 3.5 Resource and abuse limits

- Validate the declared size against storage quota and a configurable cap before accepting.
- Reject chunks with offsets beyond the declared size, oversized frames, or too many messages per second.
- Bounded queues, so a fast sender can't make the receiver run out of memory.
- Limit concurrent rooms per user and per IP.

### 3.6 Web app security

- Strict **CSP** (`default-src 'self'`, `connect-src` limited to your `wss` endpoint, no inline scripts), `Referrer-Policy: no-referrer`, and SRI on any external script. Better still, vendor the hash library locally.
- **GitHub Pages can't set custom headers.** If you want a full CSP, serve the frontend from Caddy on your VM or from Cloudflare Pages, which supports a `_headers` file.
- Lockfiles, `npm audit`, Dependabot, no third-party trackers, and secrets only in environment variables.
- **Privacy option:** a "relay-only" mode (`iceTransportPolicy: 'relay'`) hides each user's IP from the other side, at the cost of using your TURN bandwidth.

## 4. Updated protocol

```
Control channel (JSON, reliable):
  offer{transferId,name,size,mime,blockSize,lastModified} → accept | decline
  block_hash{n,sha256} → block_ok{n} | repair{n}
  ack{durableOffset}
  finish{size,sha256} → verified{sha256} | failed{reason}
  pause | resume{fromOffset} | abort

Data channel (binary, ordered):
  [ver u8][type u8][seq u64][ AES-GCM ciphertext (≤16 KB) + 16-byte tag ]
  AAD = transferId | seq | type
```

Offsets are implied by `seq × chunkSize`, so there's one less field to get wrong.

## 5. Changes to the milestone plan

| #   | Milestone                                   | Added or changed                                                                       |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Signaling, rooms, link + short code         | + Origin allowlist, schema validation, rate limits, sender login                       |
| 2   | WebRTC data channel + backpressure          | + Frame format with seq, strict validation                                             |
| 3   | **Crypto layer** (new)                      | ECDH + HKDF, fingerprint binding, AES-GCM per chunk, SAS for short codes               |
| 4   | Receiver to disk                            | + `.part` file, durable ACKs, block hashes, repair, read-back verify, two-phase finish |
| 5   | Mobile support                              | OPFS, Wake Lock, UI, per-platform size warnings                                        |
| 6   | coturn                                      | + Ephemeral credentials, private-range denial, quotas, TLS 443                         |
| 7   | Resume and edge cases                       | ICE restart, source-stability check, re-pick on sender                                 |
| 8   | Passwords, trusted devices, filename safety |                                                                                        |
| 9   | Fault-injection testing, deploy             | See below                                                                              |

## 6. Test plan

**Integrity**

- Flip a random byte in transit: it must be detected and the block repaired.
- Kill the receiver tab, kill the sender tab, toggle airplane mode, and switch networks mid-transfer: it must resume with matching hashes.
- Fill the disk during receive: clean abort, no partial file exposed.
- Edit the source file mid-send: the transfer aborts.
- Transfer 1 GB, 5 GB, and 10 GB files and compare SHA-256 from an independent tool.
- Run repeated back-to-back transfers and check for memory growth.

**Security**

- Tampered signaling (swapped fingerprints) must abort the session.
- Replay, duplicate, and out-of-order frames must be rejected.
- A wrong or brute-forced short code and password must hit the rate limit and lockout.
- TURN must refuse unauthenticated use and refuse relays to private IPs.
- Hostile filenames (`..\..\x.exe`, RTL override, 10,000 characters) must be sanitized.

.exe files are allowed. The plan never blocked any file type, so nothing there needs to be removed. The only related item was a warning on risky extensions, and I’d change that as follows:

Warning becomes a plain note. If the file is an executable (.exe, .msi, .bat, .apk, etc.), the receiver sees a small non-blocking line such as “Executable file, not scanned” on the accept screen. It doesn’t stop or slow the transfer, and the receiver taps Accept as usual. If you’d rather have no note at all, that’s a one-line change.
Kept as is: the Accept/Decline step, the “not scanned” label, the filename sanitizing (path tricks and the right-to-left override character still get stripped), and the rule that the app never auto-opens a received file. These don’t restrict file types.
Integrity checks are unaffected. .exe files go through the same encryption, block hashes, read-back verification, and final hash check. This matters most for executables, since a single flipped byte can make one unusable.
