// ─── File System Storage Abstraction ──────────────────────────────────
// Wraps the File System Access API (showSaveFilePicker) for modern
// browsers, falling back to OPFS or in-memory chunks for reliability.

export interface DiskWriter {
  /** Write raw bytes to the destination */
  write(data: Uint8Array): Promise<void>;
  /** Close and finalize the file on disk */
  close(): Promise<void>;
  /** Whether the native file picker was used (vs OPFS/blob fallback) */
  isNativePicker: boolean;
}

/**
 * Returns true if the browser supports the File System Access API
 * (showSaveFilePicker).
 * Supported: Chromium-based desktop browsers (Chrome, Edge, Opera, Brave).
 * NOT supported: Firefox, Safari, all mobile browsers, or insecure contexts (HTTP).
 */
export function supportsNativeFilePicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).showSaveFilePicker === 'function' &&
    window.isSecureContext === true
  );
}

/**
 * Open a native "Save As" dialog and return a DiskWriter that streams
 * directly to the chosen file location.
 *
 * MUST be called from a user gesture (click handler).
 */
export async function openNativeFileWriter(suggestedName: string): Promise<DiskWriter> {
  const handle = await (window as any).showSaveFilePicker({
    suggestedName,
  });
  const writable = await handle.createWritable();
  return {
    isNativePicker: true,
    async write(data: Uint8Array) {
      await writable.write(data as any);
    },
    async close() {
      await writable.close();
    },
  };
}

/**
 * Fallback writer:
 * 1. Attempts Origin Private File System (OPFS) first.
 * 2. If OPFS is unavailable or throws, seamlessly buffers in memory chunks.
 *
 * When completed, triggerDownload() initiates the standard browser download.
 */
export async function openFallbackFileWriter(
  fileName: string,
): Promise<DiskWriter & { triggerDownload(): Promise<void> }> {
  const hasOPFS =
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.getDirectory === 'function';

  if (hasOPFS) {
    try {
      const root = await navigator.storage.getDirectory();
      const tempName = `download_${Date.now()}_${Math.random().toString(36).slice(2)}.part`;
      const handle = await root.getFileHandle(tempName, { create: true });
      const writable = await (handle as any).createWritable();

      return {
        isNativePicker: false,
        async write(data: Uint8Array) {
          await writable.write(data as any);
        },
        async close() {
          await writable.close();
        },
        async triggerDownload() {
          const file = await handle.getFile();
          const url = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            root.removeEntry(tempName).catch(() => {});
          }, 1500);
        },
      };
    } catch (e) {
      console.warn('[Storage] OPFS failed, falling back to Blob chunks buffer:', e);
    }
  }

  // Memory buffer fallback
  const chunks: ArrayBuffer[] = [];
  return {
    isNativePicker: false,
    async write(data: Uint8Array) {
      const buf = new ArrayBuffer(data.byteLength);
      new Uint8Array(buf).set(data);
      chunks.push(buf);
    },
    async close() {
      // noop
    },
    async triggerDownload() {
      const blob = new Blob(chunks, { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1500);
    },
  };
}
