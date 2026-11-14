# Lemon Drop: Next.js Architecture & Migration Plan

## 1. Executive Summary & Objectives
Lemon Drop is transitioning from separate vanilla HTML/JS static files (`web/index.html`, `sender.js`, `receiver.js`) to a unified, production-ready **Next.js (App Router)** application with React, TypeScript, and Tailwind CSS.

### Why Next.js Makes Lemon Drop Easier:
1. **Component-Driven State Management**: WebRTC connection states, signaling states, transfer progress, transfer speeds, and E2EE key exchange states are complex to coordinate with imperative DOM calls (`document.getElementById`). React state and custom hooks (`useWebRTC`, `useSignaling`, `useFileTransfer`) encapsulate state cleanly.
2. **Unified Codebase & Type Safety**: WebRTC binary protocols, chunk headers, and signaling packets can be typed with shared TypeScript interfaces (`src/types/transfer.ts`), preventing serialization bugs.
3. **Responsive UI & Design System**: Tailwind CSS and modern UI components provide clean drop zones, smooth progress bars, QR code display, modal confirmations, and responsive mobile/desktop layouts.
4. **Fast Deployment & Flexibility**: Static export (`next export` / SSG) or hybrid SSR/API deployment on Vercel/Node, keeping the existing Fastify/ws signaling server (deployed on Railway) or serving WebSocket proxies if needed.

---

## 2. Target Architecture

```
                       ┌───────────────────────────────┐
                       │        Next.js App            │
                       │   (App Router + TypeScript)   │
                       └──────────────┬────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            ▼                                                   ▼
┌───────────────────────┐                           ┌───────────────────────┐
│   Sender Workflow     │                           │   Receiver Workflow   │
│ - Create Room         │                           │ - Join Room (Code/URL)│
│ - Ephemeral E2EE Key  │                           │ - Ephemeral E2EE Key  │
│ - Wait Peer Connect   │◄─── Signaling (WS) ──────►│ - Derive Shared Key   │
│ - Select File         │                           │ - Wait for Metadata   │
│ - Send Metadata (3)   │──── WebRTC DataChannel ──►│ - Prompt Save Dialog  │
│ - Wait for Ready (4)  │◄─── Ready Signal (4) ─────│   (FSA / OPFS)        │
│ - Stream Chunks (1)   │──── AES-GCM Chunks ──────►│ - Sequential Decrypt  │
│ - Send EOF (2)        │──── EOF Signal (2) ──────►│ - Flush File to Disk  │
└───────────────────────┘                           └───────────────────────┘
```

---

## 3. Directory Structure

```
lemon-drop/
├── src/
│   ├── app/                         # Next.js App Router
│   │   ├── layout.tsx               # Root layout, theme, metadata
│   │   ├── page.tsx                 # Landing / Send File (Sender page)
│   │   ├── r/                       # Receiver routes
│   │   │   ├── page.tsx             # Join room with manual code input
│   │   │   └── [roomCode]/          # Direct join link via URL (/r/ABC123#key)
│   │   └── globals.css              # Tailwind and design styles
│   ├── components/
│   │   ├── DropZone.tsx             # Interactive drag-and-drop file target
│   │   ├── TransferProgress.tsx     # Percentage, speed (MB/s), ETA, animated bar
│   │   ├── RoomShareCard.tsx        # Room code, QR code generator, copyable link
│   │   ├── ReceiverPromptModal.tsx  # Modal/banner asking receiver to accept & save
│   │   ├── ConnectionBadge.tsx      # WebRTC connection & ICE status pill
│   │   └── Navbar.tsx               # Header branding & device name display
│   ├── hooks/
│   │   ├── useSignaling.ts          # WebSocket signaling client & reconnection logic
│   │   ├── useWebRTC.ts             # RTCPeerConnection, ICE candidates, DataChannel
│   │   ├── useFileSender.ts         # File slicing, backpressure, hashing, transmission
│   │   └── useFileReceiver.ts       # Chunk queue, decryption, FileSystemAccess / OPFS
│   ├── lib/
│   │   ├── crypto.ts                # ECDH (P-256), HKDF, AES-256-GCM in WebCrypto
│   │   ├── crc32.ts                 # IEEE 802.3 CRC32 checksum calculator
│   │   ├── protocol.ts              # Binary framing & packet builders (Types 1-5)
│   │   └── storage.ts               # File System Access API & OPFS stream writers
│   ├── types/
│   │   ├── signaling.ts             # WebSocket messages (join, offer, answer, ice, etc.)
│   │   └── transfer.ts              # Transfer state, metadata, chunk definitions
│   └── server/                      # Existing Fastify/WebSocket signaling server
│       ├── app.ts
│       ├── server.ts
│       └── signaling/
├── ARCHITECTURE_PLAN.md             # This architecture blueprint
└── package.json
```

---

## 4. Binary Protocol Specification

All DataChannel packets maintain the standard framing:

| Field | Size | Description |
|---|---|---|
| `version` | 1 byte (u8) | Protocol version (`0x01`) |
| `type` | 1 byte (u8) | `1`: Data, `2`: EOF, `3`: Metadata, `4`: Ready, `5`: Reject |
| `seq` | 8 bytes (u64 Big-Endian) | Monotonically increasing sequence number (0 for Metadata) |
| `crc32` | 4 bytes (u32 Little-Endian) | Checksum of plaintext chunk |
| `payload` | Variable | Encrypted payload (IV + Ciphertext + GCM Tag) |

---

## 5. File System Access & Sequential Queue Pattern

1. **User Gesture Requirement**: Native browser `showSaveFilePicker()` requires a direct user gesture. When the sender announces the file via `Metadata (Type 3)`, the receiver UI highlights the **"Accept & Choose Location"** button.
2. **Direct Disk Stream**: Clicking the button calls `showSaveFilePicker()` and creates a `FileSystemWritableFileStream`.
3. **Sequential Decryption & Write Queue**:
   ```typescript
   // Async message queue in useFileReceiver
   const queue: ArrayBuffer[] = [];
   let processing = false;

   async function processQueue() {
     if (processing) return;
     processing = true;
     while (queue.length > 0) {
       const chunk = queue.shift()!;
       await decryptAndWrite(chunk);
     }
     processing = false;
   }
   ```
4. **Fallback to OPFS**: If `window.showSaveFilePicker` is missing (e.g. Firefox, Safari, Mobile), stream directly to OPFS (`navigator.storage.getDirectory()`) and trigger standard download when EOF is reached.
