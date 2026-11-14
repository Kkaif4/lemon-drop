import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Key, FileCheck, EyeOff } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Security Architecture | End-to-End Encryption Specifications',
  description:
    'Comprehensive security specifications for Lemon Drop. Details on AES-256-GCM encryption, ECDH key agreements, CRC32 chunk verification, and browser cryptographic primitives.',
  alternates: {
    canonical: '/security',
  },
  openGraph: {
    title: 'Security Architecture | Lemon Drop',
    description:
      'Bank-grade browser-to-browser encryption protocol and cryptographic guarantees.',
  },
};

export default function SecurityPage() {
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
        <span className="text-xs text-neutral-500 font-mono">E2EE Protocol</span>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-100 flex items-center gap-2">
          Security &amp; Cryptography
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed">
          Lemon Drop is engineered from the ground up on zero-knowledge cryptographic foundations.
          Even the Lemon Drop servers cannot read your file names, contents, or metadata.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 flex flex-col gap-2.5">
          <Key className="h-5 w-5 text-yellow-400" />
          <h2 className="text-sm font-semibold text-neutral-100">ECDH P-256 Key Exchange</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Every transfer generates an ephemeral key pair via the W3C Web Cryptography API (`crypto.subtle`). Private keys never leave browser memory and are destroyed immediately upon session termination.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 flex flex-col gap-2.5">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-semibold text-neutral-100">AES-256-GCM Encryption</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            All chunks (16 KB payload) are encrypted using authenticated 256-bit Galois/Counter Mode. A unique 96-bit nonce derived from monotonic sequence counters prevents replay and packet injection attacks.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 flex flex-col gap-2.5">
          <FileCheck className="h-5 w-5 text-blue-400" />
          <h2 className="text-sm font-semibold text-neutral-100">Bit-Level CRC32 Integrity</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Each packet carries an IEEE 802.3 CRC32 checksum in its authenticated header. The receiver verifies mathematical integrity before writing to disk, ensuring 100% bit-exact transfers.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 flex flex-col gap-2.5">
          <EyeOff className="h-5 w-5 text-purple-400" />
          <h2 className="text-sm font-semibold text-neutral-100">Zero Cloud Storage</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Files stream directly from the sender&apos;s disk to the receiver&apos;s disk. There are no temporary cloud staging buckets, no server caches, and no data retained at rest anywhere.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/30 p-5 sm:p-6 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-100">Wire Protocol Specification</h3>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Every WebRTC DataChannel packet includes a strict 14-byte binary framing header:
        </p>
        <div className="overflow-x-auto text-xs font-mono text-neutral-300 bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
          [Version (1B)] + [Type (1B)] + [Sequence (8B LE)] + [CRC32 (4B LE)] + [Encrypted Payload]
        </div>
        <p className="text-xs text-neutral-500">
          Packet Types: 1=Data, 2=EOF, 3=Metadata, 4=Ready Handshake, 5=Reject
        </p>
      </section>
    </article>
  );
}
