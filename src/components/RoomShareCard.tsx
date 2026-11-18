'use client';

import { useCallback, useState } from 'react';
import { Copy, Check, QrCode } from 'lucide-react';

interface RoomShareCardProps {
  roomCode: string | null;
  signalingUrl?: string;
  isWarmingUp?: boolean;
}

export default function RoomShareCard({ roomCode, isWarmingUp = false }: RoomShareCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = roomCode;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomCode]);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-gradient-to-b from-neutral-900/90 to-neutral-950 p-6 text-center shadow-lg relative overflow-hidden">
      <div className="absolute inset-0 bg-yellow-400/5 pointer-events-none" />
      <p className="text-xs font-semibold tracking-wider uppercase text-neutral-400 mb-2">
        Pairing Code
      </p>

      {roomCode ? (
        <div className="flex flex-col items-center">
          <div className="flex items-center justify-center gap-1.5 my-3">
            {roomCode.split('').map((char, idx) => (
              <span
                key={idx}
                className="flex h-12 w-10 sm:h-14 sm:w-12 items-center justify-center rounded-xl bg-neutral-800/90 border border-neutral-700/80 font-mono text-2xl sm:text-3xl font-extrabold text-yellow-400 shadow-inner"
              >
                {char}
              </span>
            ))}
          </div>

          <p className="text-xs text-neutral-400 mb-4">
            Enter this code on the receiver device to begin transfer.
          </p>

          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
              copied
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
            }`}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-neutral-400" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-6">
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-yellow-400 [animation-delay:0ms]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-yellow-400 [animation-delay:150ms]" />
            <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-yellow-400 [animation-delay:300ms]" />
          </div>
          <p className="text-xs text-neutral-400">
            {isWarmingUp ? 'Waking up backend on Render (~30–60s)...' : 'Generating room code...'}
          </p>
        </div>
      )}
    </div>
  );
}
