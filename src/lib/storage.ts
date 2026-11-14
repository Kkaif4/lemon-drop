// ─── File System Storage Abstraction ──────────────────────────────────
// Wraps the File System Access API (showSaveFilePicker) for modern
// browsers, falling back to OPFS for Firefox/Safari/Mobile.
//
// Both paths produce a WritableStream that chunks can be piped into
// directly, avoiding any in-memory buffering.

export interface DiskWriter {
  /** Write raw bytes to the destination */
  write(data: Uint8Array): Promise<void>;
  /** Close and finalize the file on disk */
  close(): Promise<void>;
  /** Whether the native file picker was used (vs OPFS fallback) */
  isNativePicker: boolean;
}

/**
 * Returns true if the browser supports the File System Access API
 * (showSaveFilePicker). Currently: Chrome 86+, Edge 86+, Opera 72+.
 * NOT supported: Firefox, Safari, any mobile browser.
 */
export function supportsNativeFilePicker(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

/**
 * Open a native "Save As" dialog and return a DiskWriter that streams
 * directly to the chosen file location.
 *
 * IMPORTANT: Must be called from a user gesture (click handler).
 */
export async function openNativeFileWriter(suggestedName: string): Promise<DiskWriter> {
  const handle = await (window as any).showSaveFilePicker({ suggestedName });
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
 * Fallback: create a temporary file in the Origin Private File System.
 * After the transfer completes, trigger a standard browser download.
 */
export async function openOPFSFileWriter(fileName: string): Promise<DiskWriter & { triggerDownload(): Promise<void> }> {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(`download_${Date.now()}.part`, { create: true });
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
      // Clean up after a small delay
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
    },
  };
}
