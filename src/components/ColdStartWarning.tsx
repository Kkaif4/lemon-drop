'use client';

import { useEffect, useState } from 'react';
import { Loader2, Server, Clock } from 'lucide-react';

interface ColdStartWarningProps {
  visible?: boolean;
}

export default function ColdStartWarning({ visible = true }: ColdStartWarningProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!visible) {
      setSeconds(0);
      return;
    }

    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-yellow-500/40 bg-gradient-to-r from-yellow-500/10 via-amber-500/10 to-neutral-900/80 p-4 sm:p-5 text-neutral-200 shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-yellow-400/10 blur-2xl pointer-events-none" />

      <div className="flex items-start gap-3.5 sm:gap-4 relative z-10">
        <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400/20 text-yellow-400 border border-yellow-500/30 shadow-inner">
          <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs sm:text-sm font-bold tracking-tight text-yellow-300 flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-yellow-400" />
              <span>Waking up Signaling Server (Render Free Tier)</span>
            </h4>
            <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/20 px-2 py-0.5 text-[11px] font-mono font-semibold text-yellow-300">
              <Clock className="h-3 w-3" />
              {seconds}s
            </span>
          </div>

          <p className="mt-1 text-xs text-neutral-300 leading-relaxed">
            The backend server is hosted on Render&apos;s free tier, which goes into cold sleep after 15 minutes of inactivity. Cold starts usually take <strong className="text-neutral-100">30–60 seconds</strong>.
          </p>
          <p className="mt-1.5 text-[11px] text-yellow-400/90 font-medium">
            ⏳ Stand by — your room code and connection will open automatically the moment the backend finishes booting.
          </p>
        </div>
      </div>
    </div>
  );
}