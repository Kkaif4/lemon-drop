import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, UserX, Database, ShieldAlert, Check } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy | Zero Logging & No Data Collection',
  description:
    'Lemon Drop privacy commitment: zero account requirement, zero file data retention, zero trackers, and complete cryptographic privacy.',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | Lemon Drop',
    description:
      'We do not collect personal data, log transfers, or store your files. Read our zero-data privacy policy.',
  },
};

export default function PrivacyPage() {
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
        <span className="text-xs text-neutral-500 font-mono">Privacy First</span>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-100">
          Privacy Policy
        </h1>
        <p className="text-xs text-neutral-500">Last updated: November 2026</p>
        <p className="text-sm text-neutral-400 leading-relaxed mt-1">
          Our core privacy thesis is simple: <strong>The most private data is data we never collect.</strong>
          Lemon Drop is built so that we physically cannot access your files.
        </p>
      </header>

      <section className="flex flex-col gap-4 text-xs sm:text-sm text-neutral-300">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <UserX className="h-4 w-4 text-yellow-400" />
            1. No Accounts &amp; No Identity Tracking
          </h2>
          <p className="text-neutral-400 leading-relaxed">
            You do not need to register, provide an email address, or create a profile to use Lemon Drop. Sessions are fully anonymous.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-400" />
            2. Zero File Storage &amp; Zero Retention
          </h2>
          <p className="text-neutral-400 leading-relaxed">
            Files travel directly over peer-to-peer WebRTC DataChannels from sender to receiver. Files are never uploaded, stored, mirrored, or cached on our servers or any cloud database.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-blue-400" />
            3. Ephemeral Signaling Telemetry
          </h2>
          <p className="text-neutral-400 leading-relaxed">
            Temporary room IDs and random 6-character short codes exist in server volatile memory only for the duration of the pairing process. Once both peers connect (or after 10 minutes of inactivity), the room metadata is automatically expunged.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <Check className="h-4 w-4 text-purple-400" />
            4. No Third-Party Tracking or Ads
          </h2>
          <p className="text-neutral-400 leading-relaxed">
            We do not use tracking pixels, ad networks, behavioral profiling scripts, or sell data to brokers.
          </p>
        </div>
      </section>
    </article>
  );
}
