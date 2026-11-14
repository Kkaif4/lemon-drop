import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Sparkles, Heart, Globe, Cpu } from "lucide-react";
import iconImg from "../../../public/icon.png";

export const metadata: Metadata = {
  title: "About | Decentralized & Open P2P File Sharing",
  description:
    "About Lemon Drop: an open, modern, privacy-respecting file transfer tool designed to eliminate cloud storage bottlenecks and file size paywalls.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About Lemon Drop",
    description:
      "Learn the story and philosophy behind Lemon Drop: decentralized, unlimited, and encrypted direct file transfer.",
  },
};

export default function AboutPage() {
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
        <span className="text-xs text-neutral-500 font-mono">Mission</span>
      </div>

      <header className="flex flex-col items-center sm:items-start gap-4">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl shadow-lg shadow-yellow-500/10">
          <Image
            src={iconImg}
            alt="Lemon Drop"
            fill
            sizes="64px"
            priority
            className="object-cover"
          />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-100">
            About Lemon Drop
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Reimagining file sharing without cloud middlemen, artificial limits,
            or privacy compromises.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5 text-xs sm:text-sm text-neutral-300 leading-relaxed">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6 flex flex-col gap-2.5">
          <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-yellow-400" />
            The Problem with Cloud File Sharing
          </h2>
          <p className="text-neutral-400">
            Traditional file sharing services require uploading your entire file
            to someone else&apos;s data center before your recipient can
            download it. This introduces three massive friction points:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-neutral-400 mt-1">
            <li>
              <strong>Double Transfer Time:</strong> Upload to the cloud first,
              then download to recipient.
            </li>
            <li>
              <strong>Artificial Paywalls:</strong> Restrictive 2 GB caps unless
              you pay monthly fees.
            </li>
            <li>
              <strong>Privacy Vulnerabilities:</strong> Stored files are
              susceptible to scans, leaks, and retention policies.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6 flex flex-col gap-2.5">
          <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400" />
            The Lemon Drop Philosophy
          </h2>
          <p className="text-neutral-400">
            Modern web browsers are capable operating environments. Leveraging
            WebRTC DataChannels, the File System Access API, and native
            WebCrypto, Lemon Drop establishes a direct, encrypted virtual pipe
            between two browsers.
          </p>
          <p className="text-neutral-400">
            Your computer speaks directly to your recipient&apos;s computer. You
            can transfer a 100 MB PDF, a 40 GB 4K video reel, or a large code
            archive at full network wire speed without uploading a single byte
            to an external server.
          </p>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6 flex flex-col gap-2.5">
          <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-400" />
            Decentralized &amp; Accessible
          </h2>
          <p className="text-neutral-400">
            Lemon Drop is built for simplicity and accessibility. There is no
            software to install, no browser extensions required, and no
            subscription needed. Open the page, pair with a 6-character code,
            and transfer directly.
          </p>
        </section>
      </div>

      <div className="pt-2 text-center text-xs text-neutral-500 flex items-center justify-center gap-1">
        <span>Crafted out of</span>
        passion
        <span>for a private, decentralized web.</span>
      </div>
    </article>
  );
}
