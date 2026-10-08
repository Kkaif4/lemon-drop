# Live Transfer: Change Plan (Mobile-First)

## 1. What changes from the stored-file plan

| Area                        | Before (stored)                         | Now (live)                                                                |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| Storage                     | R2/S3 bucket, quota, lifecycle rules    | **Removed**                                                               |
| Database                    | Postgres (files, sessions, links, jobs) | **Mostly removed.** Rooms live in memory.                                 |
| Scan worker / ClamAV        | Yes                                     | **Removed.** Replaced by an accept prompt plus sender details.            |
| Share links, expiry cleanup | Yes                                     | Replaced by **rooms** (short-lived, one transfer)                         |
| Idempotency keys            | DB table                                | Same idea, but **in-memory per room**                                     |
| Password                    | Argon2 on the share link                | Argon2 on the **room**, checked before signaling continues                |
| Integrity                   | Per-part checksum + SHA-256 after scan  | **Per-chunk sequence + CRC, whole-file SHA-256 computed as data streams** |
| Fallback path               | None needed                             | **TURN relay is required**, not optional (mobile)                         |
| Server load                 | API + worker + DB                       | Signaling (tiny) + TURN (bandwidth)                                       |

## 2. New architecture

```
Sender (phone/laptop)                                  Receiver (phone/laptop)
   │  wss (signaling: room, password, SDP/ICE)             │
   └────────────► Node signaling server ◄──────────────────┘
                   │  issues short-lived TURN credentials
                   ▼
                 coturn  (UDP 3478, TCP 3478, TLS 5349/443)
   ▲                                                       ▲
   └──── WebRTC data channels (direct if possible, else via TURN) ────┘
```

Frontend stays plain HTML/JS on GitHub Pages. Everything real-time goes through one `wss://` endpoint.

## 3. Why mobile changes the design

Mobile networks commonly put users behind carrier-grade NAT, often block or throttle UDP, and switch between Wi-Fi and cellular. So:

- **TURN moves from "later" to "day one."** Without it, many phone-to-phone transfers will fail.
- **Offer TURN over TCP and TLS on port 443** as well as UDP. Some carriers and corporate networks block UDP.
- **Use ephemeral TURN credentials.** The signaling server generates time-limited credentials (HMAC with a shared secret) only after a valid room join. Without that, strangers could use your relay as a free proxy.
- **Cap TURN usage** in coturn (per-user bandwidth and quota) so one transfer can't eat your VM.
- **Handle network changes** (Wi-Fi to 4G) with an ICE restart, then resume from the last confirmed offset.
- **Warn about data use.** A 10 GB transfer on a mobile plan costs data. Show the size and require confirmation on cellular where the browser exposes it, and always show a clear estimate.

## 4. Transfer protocol

**Two channels:**

- `control` (reliable, JSON): file metadata, accept/decline, acknowledgements, pause/resume, final hash.
- `data` (reliable, ordered, binary): file chunks.

**Chunk frame:** `[type][transferId][seq][offset][payload]` with 16 KB payloads (safe across browsers) and a CRC32 per chunk. CRC is cheap on phones, whereas SHA-256 per chunk is not.

**Flow control:**

- The sender watches `bufferedAmount` and pauses above ~1 MB, resuming on `bufferedamountlow`.
- The receiver sends an ACK roughly every 4 MB. The sender never has more than ~16 MB unacknowledged.
- On reconnect, the sender restarts from the last ACKed offset.

**Integrity ("missing packets"):** the channel is ordered and reliable, so the sequence number and CRC are for detecting bugs and corruption, not routine loss. Both sides compute an incremental **SHA-256** (WASM, in a worker) as chunks pass through in order, and compare at the end. Show a pass/fail result.

**Duplicate requests:** every transfer has a `transferId`. Offer, accept, and complete messages are idempotent on that ID. Buttons disable after one tap, and a second `offer` for an active room is rejected.

## 5. Receiving large files: the biggest platform split

| Receiver                 | How to save without RAM blowup               | Realistic limit                         |
| ------------------------ | -------------------------------------------- | --------------------------------------- |
| Desktop Chrome/Edge      | `showSaveFilePicker` stream straight to disk | 10 GB OK                                |
| Desktop Firefox / Safari | Service-worker streaming download, or OPFS   | Test; likely OK                         |
| Android Chrome           | Service-worker streaming or OPFS, then save  | Test 5-10 GB                            |
| iOS Safari               | OPFS (disk-backed), then offer the file      | **Risky above a few GB**, so test early |

Plan: write incoming chunks to **OPFS** (browser-private disk storage) in a worker, then hand the file to the user for download or share. That gives disk-backed storage on most modern browsers, and it also lets the receiver resume after a reload, because the partial file and offset persist. I haven't verified how each mobile browser behaves at 10 GB, so make per-platform size warnings a configurable setting and tune them from your own tests.

## 6. Mobile-specific changes

- **Keep the screen awake:** the Wake Lock API on both sender and receiver, with a visible "keep this screen open" banner.
- **Background and lock behavior:** mobile browsers often suspend or kill hidden tabs. Handle `visibilitychange`, pause cleanly, and auto-reconnect and resume when the tab returns. Be upfront in the UI that a locked phone can interrupt the transfer.
- **Sender resume limit:** a browser can't reopen a file after the page reloads without the user picking it again. Match by name, size, and last-modified, then continue from the receiver's offset.
- **Pairing:** the sender shows a **QR code and a short code**. On a phone, the camera app scans the QR and opens the link, so you don't need an in-page scanner.
- **UI:** one screen per step, large tap targets, progress, speed, ETA, and clear states ("waiting for receiver", "connecting", "direct" or "via relay", "paused", "verifying"). Show whether the path is direct or relayed.
- **Optional later:** installable PWA, and on Android a "share to app" target so you can send a photo straight from the gallery.

## 7. Server changes

```
server/src/
  app.ts            # http + ws bootstrap, CORS for your Pages origin
  config.ts
  signaling/
    ws.ts           # connection handling, heartbeat, message validation (zod)
    rooms.ts        # in-memory Map, TTL, one sender + one receiver
    messages.ts     # offer/answer/ice/accept/decline/resume types
  security/
    roomCodes.ts    # code generation, rate limits
    password.ts     # argon2 verify, lockout
    turnCreds.ts    # ephemeral TURN credentials
  lib/rateLimit.ts
web/
  index.html (send)  r.html (receive)
  js/ signaling.js  peer.js  sender.js  receiver.js  hash.worker.js  opfs.worker.js  wakelock.js
```

**Room rules:**

- Long random link token plus a short code (6-8 characters). Short codes get strict rate limits and expire in about 10 minutes.
- One sender and one receiver per room. A third join is refused.
- The sender sees who connected and must **accept** before any data flows.
- If a password is set, the server withholds signaling messages until it's verified (argon2 plus lockout after repeated failures).
- Heartbeats detect dead sockets, and idle rooms are cleaned up.
- A server restart drops active rooms, so clients must handle "signaling lost" with a reconnect to the same room where possible. Active transfers over an already-open data channel keep going, since the server isn't in the data path (except on TURN).

## 8. Deployment changes

- **Signaling:** Render's free tier can host it, but cold starts delay the first connection, and I haven't confirmed how an idle WebSocket interacts with its sleep timer, so test it. An always-on VM is steadier.
- **TURN:** it needs UDP and TCP ports, which Render's free web services don't offer. Run **coturn on an Oracle Always Free VM**, or use a TURN provider's free tier (check its current limits and what happens past them).
- **All-in-one on the VM:** `docker-compose` with Caddy (TLS, `wss`), the signaling server, and coturn.
- **TLS everywhere:** Wake Lock, service workers, and secure WebSockets all require HTTPS, which GitHub Pages and Caddy provide.
- **Relay bandwidth is your cost ceiling.** Watch how much of your traffic goes through TURN, since that's what the VM's bandwidth must cover.

## 9. Milestones and tests

| #   | Milestone                                                          | Done when                                                          |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1   | Signaling server, rooms, short code + link, accept/decline         | Two browsers pair and exchange messages                            |
| 2   | WebRTC data channel, 16 KB chunks, backpressure, desktop → desktop | A 1 GB file transfers without memory growth                        |
| 3   | Receiver to disk (desktop first), incremental SHA-256, ACKs        | A 5 GB file arrives with matching hashes                           |
| 4   | Mobile receiving via OPFS, Wake Lock, UI for phones                | Android and iPhone receive a 1-2 GB file                           |
| 5   | coturn, ephemeral credentials, TCP/TLS 443                         | Transfer succeeds between two phones on different carriers         |
| 6   | Resume: ICE restart, offset ACK, re-pick on sender                 | Switching Wi-Fi to 4G mid-transfer continues the transfer          |
| 7   | Passwords, rate limits, lockout, TURN quotas                       | Wrong password is locked out, and TURN refuses unauthenticated use |
| 8   | Deploy, soak test, mobile test matrix                              | 10 GB test completes on a good connection                          |

**Mobile test matrix:** Android Chrome and iOS Safari, each on Wi-Fi, Jio, and Airtel, in these scenarios: screen lock, switching networks, kill and reopen the tab, and sending to a desktop and to another phone.

## 10. Biggest unknowns to test first

1. **iOS Safari large receives:** this decides what file-size limit you can honestly offer on iPhones.
2. **Direct-connect success rate** between phones on Jio and Airtel, and how often TURN is needed.
3. **Real throughput** over the data channel versus plain HTTP on your devices.
4. **Background behavior** when a phone is locked mid-transfer.
