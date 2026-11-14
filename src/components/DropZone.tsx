"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2 } from "lucide-react";

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  disabled: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function DropZone({
  onFileSelect,
  selectedFile,
  disabled,
}: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragOver(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [disabled, onFileSelect],
  );

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
      e.target.value = "";
    },
    [onFileSelect],
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed
        p-8 text-center transition-all duration-300 backdrop-blur-sm
        ${
          disabled
            ? "cursor-not-allowed border-neutral-800 bg-neutral-900/30 text-neutral-600 opacity-60"
            : isDragOver
              ? "cursor-copy border-yellow-400 bg-yellow-400/10 text-yellow-300 scale-[1.01] shadow-lg shadow-yellow-500/10"
              : "cursor-pointer border-neutral-700 hover:border-yellow-400/80 bg-neutral-900/60 hover:bg-neutral-800/80 text-neutral-300 shadow-sm"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />

      {selectedFile ? (
        <div className="flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400/20 text-yellow-400">
            <FileText className="h-6 w-6" />
          </div>
          <div className="max-w-[280px] sm:max-w-md">
            <p className="font-semibold text-neutral-100 truncate text-sm sm:text-base">
              {selectedFile.name}
            </p>
            <p className="text-xs text-neutral-400 mt-0.5">
              {formatFileSize(selectedFile.size)} &bull; Ready to transmit
            </p>
          </div>
          <span className="mt-2 text-xs font-medium text-yellow-400 hover:underline">
            Click or drop to replace
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-transform ${isDragOver ? "scale-110 bg-yellow-400/20 text-yellow-400" : "bg-neutral-800 text-neutral-400"}`}
          >
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-200">
              <span className="text-yellow-400 hover:underline">
                Choose a file
              </span>{" "}
              or drag & drop here
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Supports any size &bull; Direct stream to peer disk
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
