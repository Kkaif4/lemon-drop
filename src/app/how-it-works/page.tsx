import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Wifi, Lock, HardDrive, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works | Peer-to-Peer Encrypted File Transfer",
  description:
    "Learn how Lemon Drop enables direct browser-to-browser file transfers using WebRTC DataChannels and AES-256-GCM encryption without any cloud storage middleman.",
  alternates: {
    canonical: "/how-it-works",
  },
  openGraph: {
    title: "How It Works | Lemon Drop P2P Transfer",
    description:
      "Step-by-step breakdown of direct WebRTC peer-to-peer file transfers and zero-cloud architecture.",
  },
};

export default function HowItWorksPage() {
  return (
    <article className="flex flex-col gap-8 text-neutral-200">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-900">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-yellow-400 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Transfer</span>
        </Link>
        <span className="text-xs text-neutral-500 font-mono">Architecture</span>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-100">
          How Lemon Drop Works
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed">
          Lemon Drop transfers files directly between two devices using
          decentralized WebRTC DataChannels. Your files never touch an
          intermediate cloud server or third-party storage bucket.
        </p>
      </header>

      <section className="flex flex-col gap-6">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
              <Wifi className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">
                1. WebRTC Signaling &amp; Room Pairing
              </h2>
              <p className="text-xs text-neutral-400">
                Lightweight session handshake
              </p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
            When you create a room, a temporary 6-character code is generated. A
            lightweight WebSocket signaling server coordinates the initial
            connection handshake (SDP offer/answer and ICE candidate exchange).
            Once the connection is established, the signaling server drops out
            of the data path.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">
                2. Ephemeral End-to-End Key Exchange
              </h2>
              <p className="text-xs text-neutral-400">
                Zero-knowledge cryptography
              </p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
            Both browsers generate an ephemeral Elliptic Curve Diffie-Hellman
            (ECDH P-256) keypair. Public keys are exchanged over the encrypted
            channel, and HKDF derives a shared 256-bit AES-GCM session key.
            Every chunk is encrypted in the browser before leaving your machine.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-400/10 text-blue-400">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">
                3. Direct-to-Disk Stream &amp; Checksums
              </h2>
              <p className="text-xs text-neutral-400">
                No memory leaks or file size barriers
              </p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
            The receiver browser uses the File System Access API or Origin
            Private File System (OPFS) to stream decrypted packets directly onto
            disk as they arrive. An asynchronous queue ensures strictly ordered
            sequence processing, and IEEE 802.3 CRC32 checksums verify file
            integrity chunk-by-chunk.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/20 p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-yellow-400" />
          Key Advantages
        </h3>
        <ul className="text-xs sm:text-sm text-neutral-400 space-y-1.5 list-disc pl-5">
          <li>
            <strong>Zero Size Limits:</strong> Send gigabytes or terabytes
            without server limits.
          </li>
          <li>
            <strong>Maximum Speed:</strong> Direct LAN/peer throughput
            unconstrained by cloud upload speeds.
          </li>
          <li>
            <strong>Total Privacy:</strong> Data cannot be intercepted, logged,
            or scanned by hosting providers.
          </li>
        </ul>
      </section>
    </article>
  );
}
