'use client';

import { CheckCircle2, Zap } from 'lucide-react';

interface TransferProgressProps {
  percentage: number;
  bytesTransferred: number;
  totalBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  isComplete: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  const speed = bytesPerSec / Math.pow(1024, idx);
  return `${speed.toFixed(1)} ${units[idx]}`;
}

export default function TransferProgress({
  percentage,
  bytesTransferred,
  totalBytes,
  speedBytesPerSec,
  etaSeconds,
  isComplete,
}: TransferProgressProps) {
  const clampedPct = Math.min(100, Math.max(0, percentage));

  return (
    <div className="w-full space-y-3.5">
      {/* Top row percentage and speed */}
      <div className="flex items-center justify-between text-xs sm:text-sm font-medium">
        <span className="text-neutral-200 flex items-center gap-1.5 font-mono">
          <span className="text-yellow-400 font-bold">{clampedPct.toFixed(1)}%</span>
        </span>
        {!isComplete && (
          <span className="text-neutral-400 flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
            <span className="font-mono">{formatSpeed(speedBytesPerSec)}</span>
          </span>
        )}
      </div>

      {/* Progress bar with smooth glow */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            isComplete
              ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
              : 'bg-yellow-400 shadow-sm shadow-yellow-400/50'
          }`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>

      {/* Detail row */}
      {isComplete ? (
        <div className="flex items-center justify-center gap-1.5 text-xs sm:text-sm text-emerald-400 font-semibold pt-1">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Complete &bull; {formatBytes(totalBytes)} transferred</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400 pt-0.5">
          <div className="truncate">
            <span className="text-neutral-500">Transferred: </span>
            <span className="font-mono text-neutral-300">{formatBytes(bytesTransferred)}</span> / <span className="font-mono">{formatBytes(totalBytes)}</span>
          </div>
          <div className="text-right truncate">
            <span className="text-neutral-500">Est. Time: </span>
            <span className="font-mono text-neutral-300">{formatTime(etaSeconds)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
