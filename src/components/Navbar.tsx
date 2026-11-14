"use client";

import Link from "next/link";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import iconImg from "../../public/icon.png";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md px-4 sm:px-6 py-3">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group select-none">
          <div className="relative h-8 w-8 sm:h-9 sm:w-9 overflow-hidden rounded-xl shadow-md shadow-yellow-500/10 transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
            <Image
              src={iconImg}
              alt="LemonDrop Logo"
              fill
              sizes="36px"
              priority
              className="object-cover"
            />
          </div>
          <span className="font-bold text-base sm:text-lg tracking-tight text-neutral-100">
            Lemon<span className="text-yellow-400">Drop</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 bg-neutral-900/60 border border-neutral-800 px-2.5 py-1 rounded-full">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span className="hidden xs:inline sm:inline">E2EE</span> Direct P2P
        </div>
      </div>
    </header>
  );
}
