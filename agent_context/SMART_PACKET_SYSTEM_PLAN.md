# Smart Adaptive Packet System: Architecture & Implementation Plan

## 1. Executive Summary

The **Smart Adaptive Packet System** replaces LemonDrop's fixed 16 KB chunking mechanism with a closed-loop, telemetry-driven engine. It dynamically adjusts frame sizes between **16 KB and 256 KB** and modulates transmission windows based on real-time network throughput (RTT, bandwidth estimation) and peer processing capacities (decryption latency, disk write speeds).

---

## 2. Technical Architecture & Component Interaction

```
┌────────────────────────────────────────────────────────────────────────┐
│                          SENDER WORKSPACE                              │
│                                                                        │
│   [ File Reader / Worker ] ──► [ Web Crypto AES-GCM Worker ]           │
│                                           │ (Transferable ArrayBuffer) │
│                                           ▼                            │
│                        ┌─────────────────────────────────────┐         │
│                        │   Dynamic Sizer & AIMD Controller   │         │
│                        │     - Monitors `bufferedAmount`     │         │
│                        │     - Evaluates Receiver ACKs       │         │
│                        │     - Determines Chunk Size (16-256)│         │
│                        └──────────────────┬──────────────────┘         │
│                                           │ Framed Packet              │
│                                           ▼                            │
│                               [ WebRTC DataChannel ]                   │
└───────────────────────────────────────────┼────────────────────────────┘
                                            │ Wire Frame (16KB - 256KB)
                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         RECEIVER WORKSPACE                             │
│                                                                        │
│                               [ WebRTC DataChannel ]                   │
│                                           │                            │
│                                           ▼                            │
│                         ┌────────────────────────────────────┐         │
│                         │ Sequential De-framing & CRC32      │         │
│                         └─────────────────┬──────────────────┘         │
│                                           │ Encrypted Bytes            │
│                                           ▼                            │
│                         ┌────────────────────────────────────┐         │
│                         │   Decryption Worker (AES-GCM)      │         │
│                         └─────────────────┬──────────────────┘         │
│                                           │ Plaintext                  │
│                                           ▼                            │
│                         ┌────────────────────────────────────┐         │
│                         │ Disk Writer (OPFS / Native Access) │         │
│                         └─────────────────┬──────────────────┘         │
│                                           │ Telemetry Metrics          │
│                                           ▼                            │
│                        [ Telemetry ACK Generator (Control) ]           │
│                                           │                            │
└───────────────────────────────────────────┼────────────────────────────┘
                                            │ Periodic Control ACK (RTT, Pressure)
                                            └──► (Back to Sender Controller)
```

---

## 3. Protocol Wire Format Extensions

The binary header remains **14 bytes**, with extended packet types in byte `[1]`:

```
Wire Format:
[0]      version   u8        always 0x01
[1]      type      u8        1=Data, 2=EOF, 3=Metadata, 4=Ready, 5=Reject, 6=ACK, 7=Resize
[2..9]   seq       u64 LE    Monotonically increasing sequence number
[10..13] crc32     u32 LE    IEEE 802.3 CRC of the plaintext chunk
```

### New Packet Types:
- **`ACK` (Type 6):** Sent by receiver every $N$ megabytes (or every $K$ chunks).
  - Payload:
    ```json
    {
      "ackedSeq": 412,
      "recvBytes": 27053248,
      "writeLatencyMs": 3.4,
      "bufferPressure": "low" | "medium" | "high",
      "timestamp": 1718000000123
    }
    ```
- **`RESIZE` (Type 7):** Sent by sender to announce a packet tier switch before streaming larger or smaller chunks.

---

## 4. Adaptive Sizing & Flow Control Algorithm

### A. Dynamic Sizing Tiers
- **Tier 1 (16 KB):** Initial default, lossy cellular connections (4G/LTE), or when receiver disk indicates `bufferPressure == 'high'`.
- **Tier 2 (64 KB):** Balanced tier for typical home Wi-Fi and 5G networks. Cuts encryption call overhead by 75%.
- **Tier 3 (128 KB):** High-speed broadband (>100 Mbps) with low RTT (<30 ms).
- **Tier 4 (256 KB):** Maximum allowed SCTP payload size across Chrome, Firefox, and Safari for gigabit fiber and LAN environments.

### B. Controller State Machine (AIMD Engine)

1. **Slow Start / Ramp-up:**
   - Begin transfer at **16 KB**.
   - After every 32 consecutive chunks without backpressure, probe link velocity:
     $$\text{ChunkSize} \leftarrow \min(\text{ChunkSize} \times 2, 256\text{ KB})$$
2. **Congestion & Backpressure Detection:**
   - Trigger condition: Sender `dc.bufferedAmount` stays above 1.5 MB for $> 30\text{ ms}$ OR receiver reports `bufferPressure == 'high'`.
   - Multiplicative drop:
     $$\text{ChunkSize} \leftarrow \max(\lfloor\text{ChunkSize} / 2\rfloor, 16\text{ KB})$$
3. **Continuous Window Streaming (Eliminating Stop-and-Wait):**
   - High-Water Mark: **1.5 MB**
   - Low-Water Mark: **512 KB**
   - Never wait for the buffer to completely drain to zero. Stream continually while buffer is under the high-water threshold.

---

## 5. Web Worker Cryptographic Pipeline

1. **Offloading Encryption:**
   - Dedicated `sender.worker.ts` handles `file.slice()`, AES-256-GCM encryption via Web Crypto API, and CRC32 calculation.
   - Yields encrypted chunks to main thread using Transferable Objects (`[chunkBuffer]`), causing **zero GC pressure** on the UI thread.
2. **Offloading Decryption & Disk Streaming:**
   - Dedicated `receiver.worker.ts` decrypts incoming chunks and streams directly to **OPFS (Origin Private File System)** via `FileSystemSyncAccessHandle`.
   - UI receives throttled progress updates (every 200 ms) rather than handling per-chunk state updates.

---

## 6. Implementation Task List

### Phase 1: Protocol Framing & Sliding Window Refactoring
- [x] Define `PacketType.ACK` and `PacketType.RESIZE` in [src/types/transfer.ts](file:///home/kaif/storage/MyProjects/lemon-drop/src/types/transfer.ts).
- [x] Add header builder and parser helpers for telemetry ACK packets in [src/lib/protocol.ts](file:///home/kaif/storage/MyProjects/lemon-drop/src/lib/protocol.ts).
- [x] Refactor backpressure control in [src/hooks/useFileSender.ts](file:///home/kaif/storage/MyProjects/lemon-drop/src/hooks/useFileSender.ts) to use continuous dual-threshold streaming (High: 1.5MB, Low: 512KB) instead of start-stop pauses.
- [x] Implement receiver-side ACK emitter in [src/hooks/useFileReceiver.ts](file:///home/kaif/storage/MyProjects/lemon-drop/src/hooks/useFileReceiver.ts) sending telemetry every 1.5 MB received.

### Phase 2: Adaptive Chunk Sizing Engine
- [x] Create `lib/adaptiveSizer.ts` with AIMD (Additive Increase, Multiplicative Decrease) state machine.
- [x] Implement dynamic chunk slicing logic in sender reading from 16 KB up to 256 KB.
- [x] Connect receiver feedback telemetry to sizer state machine to step down chunk size on slow disk writes.
- [x] Handle dynamic chunk verification on receiver (parsing variable-length payloads without rigid chunk size assumptions).

### Phase 3: Cryptography & Disk IO Worker Offloading
- [ ] Create `src/workers/encryptWorker.ts` to execute AES-256-GCM and CRC32 off the main thread.
- [ ] Create `src/workers/decryptWorker.ts` with direct OPFS sync file handle piping.
- [ ] Bridge worker messaging with WebRTC DataChannel using zero-copy Transferable ArrayBuffers.
- [ ] Ensure seamless fallback for browsers lacking OPFS sync access handles.

### Phase 4: UI Instrumentation & Performance Observability
- [x] Add real-time transfer diagnostic metrics to UI:
  - Current chunk size (16KB / 64KB / 128KB / 256KB).
  - Dynamic RTT calculation.
  - Bottleneck indicator (Network vs. Disk vs. CPU).
- [x] Update `TransferProgress.tsx` to display real-time throughput graph or metrics.

### Phase 5: Verification & Benchmarking
- [x] Unit test adaptive chunk scaling, multiplicative decrease, and bottleneck detection.
- [x] Verify protocol framing and serialization integrity for telemetry packets.
- [x] Validate multi-file consecutive transfers with dynamic sizing active.
