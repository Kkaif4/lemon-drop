'use client';

import { useEffect, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface CancelTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fileName?: string;
  percentage?: number;
}

export default function CancelTransferModal({
  isOpen,
  onClose,
  onConfirm,
  fileName,
  percentage,
}: CancelTransferModalProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm sm:max-w-md rounded-2xl border border-red-500/30 bg-gradient-to-b from-neutral-900 via-neutral-900 to-neutral-950 p-6 sm:p-7 shadow-2xl shadow-red-500/10 text-center animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient red hazard glow */}
        <div className="absolute -top-14 -right-14 h-36 w-36 rounded-full bg-red-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-14 -left-14 h-36 w-36 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />

        {/* Close icon top-right */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Warning Icon Badge */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/15 text-red-400 shadow-inner">
          <AlertTriangle className="h-7 w-7 text-red-400 animate-pulse" />
        </div>

        {/* Title */}
        <h3
          id="cancel-modal-title"
          className="text-lg sm:text-xl font-bold tracking-tight text-neutral-100"
        >
          Cancel File Transfer?
        </h3>

        {/* Description */}
        <p className="mt-2 text-xs sm:text-sm text-neutral-300 leading-relaxed">
          Are you sure you want to stop transferring{' '}
          <span className="font-semibold text-neutral-100 truncate inline-block max-w-[200px] align-bottom">
            {fileName || 'this file'}
          </span>
          ?
        </p>

        {typeof percentage === 'number' && percentage > 0 && percentage < 100 && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800/80 px-3 py-1 text-xs text-neutral-400 font-mono">
            <span>Progress:</span>
            <span className="text-yellow-400 font-bold">{percentage.toFixed(1)}%</span>
            <span>will be discarded</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800/90 py-3 text-xs sm:text-sm font-semibold text-neutral-300 transition-all hover:bg-neutral-700 hover:text-neutral-100 active:scale-95 shadow-sm"
          >
            Keep Transferring
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 inline-flex items-center justify-center rounded-xl bg-red-500 py-3 text-xs sm:text-sm font-bold text-white transition-all hover:bg-red-600 active:scale-95 shadow-md shadow-red-500/25"
          >
            Yes, Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
