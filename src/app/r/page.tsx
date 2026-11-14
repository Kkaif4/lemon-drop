'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useFileReceiver } from '@/hooks/useFileReceiver';
import ConnectionBadge from '@/components/ConnectionBadge';
import TransferProgress from '@/components/TransferProgress';
import StatusMessage from '@/components/StatusMessage';
import {
  ArrowLeft,
  Download,
  FileText,
  CheckCircle2,
  X,
  RefreshCw,
  LogOut,
  AlertTriangle,
} from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function ReceiverContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') || '';

  const [inputCode, setInputCode] = useState(initialCode);
  const [activeCode, setActiveCode] = useState('');
  const [joined, setJoined] = useState(false);

  const signaling = useSignaling();

  const webrtc = useWebRTC({
    isSender: false,
    send: signaling.send,
    onMessage: signaling.onMessage,
  });

  const fileReceiver = useFileReceiver({
    dataChannel: webrtc.dataChannel,
    e2ee: webrtc.e2ee,
  });

  const handleIncomingDataRef = useRef(fileReceiver.handleIncomingData);
  useEffect(() => {
    handleIncomingDataRef.current = fileReceiver.handleIncomingData;
  }, [fileReceiver.handleIncomingData]);

  useEffect(() => {
    if (webrtc.dataChannel) {
      webrtc.dataChannel.onmessage = (event) => {
        handleIncomingDataRef.current(event.data);
      };
    }
  }, [webrtc.dataChannel]);

  const webrtcRef = useRef(webrtc);
  useEffect(() => {
    webrtcRef.current = webrtc;
  }, [webrtc]);

  useEffect(() => {
    signaling.onMessage(async (msg) => {
      if (msg.type === 'joined') {
        await webrtcRef.current.initiate();
      } else {
        await webrtcRef.current.handleSignaling(msg);
      }
    });
  }, [signaling]);

  const handleJoin = (codeToJoin?: string) => {
    const targetCode = (codeToJoin || inputCode).trim().toUpperCase();
    if (targetCode.length < 4) return;

    setActiveCode(targetCode);
    const deviceName = `Browser-${Math.floor(1000 + Math.random() * 9000)}`;
    signaling.joinRoom(targetCode, undefined, deviceName);
    setJoined(true);
  };

  const handleDisconnect = () => {
    webrtc.disconnect();
    signaling.disconnect();
    fileReceiver.resetTransfer();
    setJoined(false);
  };

  const handleReconnect = () => {
    if (!activeCode) return;
    webrtc.disconnect();
    fileReceiver.resetTransfer();
    signaling.reconnectRoom(activeCode);
  };

  useEffect(() => {
    if (initialCode && !joined) {
      handleJoin(initialCode);
    }
  }, [initialCode]);

  return (
    <div className="flex flex-col gap-5 sm:gap-6 w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-neutral-900">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-100 flex items-center gap-2">
            Receive Files
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Stream directly onto your hard drive
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <ConnectionBadge state={webrtc.connectionState} />
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/80 px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 active:scale-95"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Send</span>
          </Link>
        </div>
      </div>

      {!joined ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleJoin();
          }}
          className="flex flex-col items-center justify-center rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-6 sm:p-10 text-center shadow-lg"
        >
          <div className="mb-4 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-yellow-400/10 text-3xl shadow-inner">
            📥
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-neutral-100">
            Enter Pairing Code
          </h2>
          <p className="mt-2 max-w-sm text-xs sm:text-sm text-neutral-400 leading-relaxed">
            Enter the 6-character code shown on the sender device to establish connection.
          </p>

          <div className="w-full max-w-xs mt-6">
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="XXXXXX"
              autoFocus
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3.5 text-center font-mono text-2xl sm:text-3xl font-extrabold tracking-widest text-yellow-400 placeholder:text-neutral-700 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 focus:outline-none transition-all shadow-inner"
            />
          </div>

          <button
            type="submit"
            disabled={inputCode.trim().length < 4}
            className="mt-4 w-full max-w-xs inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3.5 font-bold text-neutral-950 transition-all hover:bg-yellow-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 text-sm sm:text-base shadow-md shadow-yellow-500/10"
          >
            Connect to Sender
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-5 sm:gap-6">
          {/* Active room & session controls */}
          <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/80 p-3.5 sm:p-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-neutral-400">Room:</span>
              <span className="font-mono font-bold text-yellow-400 text-sm">{activeCode}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReconnect}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors"
                title="Reconnect to room"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reconnect</span>
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-red-400 hover:bg-red-500/20 transition-colors"
                title="Leave room"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Leave</span>
              </button>
            </div>
          </div>

          {/* Status feedback */}
          <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 sm:p-4 text-xs sm:text-sm">
            <StatusMessage
              message={
                webrtc.connectionState === 'connected'
                  ? 'Connected to sender! Waiting for sender to select file...'
                  : webrtc.connectionState === 'disconnected' || webrtc.connectionState === 'closed'
                    ? 'Sender disconnected. Click Reconnect if sender rejoins.'
                    : signaling.status === 'connected'
                      ? 'Joined room. Establishing secure peer connection...'
                      : 'Connecting to room...'
              }
              variant={
                webrtc.connectionState === 'connected'
                  ? 'success'
                  : webrtc.connectionState === 'disconnected'
                    ? 'warning'
                    : 'info'
              }
            />
            {signaling.error && <StatusMessage message={signaling.error} variant="error" />}
          </div>

          {/* Accept Transfer Prompt Dialog */}
          {fileReceiver.transferState === 'waiting-for-acceptance' && fileReceiver.fileMetadata && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-yellow-500/40 bg-gradient-to-b from-yellow-500/15 to-neutral-900/80 p-5 sm:p-6 text-center shadow-xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-yellow-400/20 text-yellow-400 shadow-inner">
                <FileText className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <div className="max-w-full">
                <h3 className="text-xs font-semibold tracking-wider uppercase text-yellow-400 mb-1">
                  Incoming File
                </h3>
                <p className="font-semibold text-neutral-100 text-sm sm:text-base truncate max-w-[280px] sm:max-w-md mx-auto">
                  {fileReceiver.fileMetadata.name}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                  {formatBytes(fileReceiver.fileMetadata.size)}
                </p>
              </div>

              <div className="flex w-full flex-col-reverse sm:flex-row gap-2.5 pt-2 max-w-sm">
                <button
                  type="button"
                  onClick={fileReceiver.rejectTransfer}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800/80 py-3 text-xs sm:text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-700 active:scale-95"
                >
                  <X className="h-4 w-4" />
                  <span>Decline</span>
                </button>
                <button
                  type="button"
                  onClick={fileReceiver.acceptTransfer}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-yellow-400 py-3 text-xs sm:text-sm font-bold text-neutral-950 transition-colors hover:bg-yellow-300 active:scale-95 shadow-md shadow-yellow-500/10"
                >
                  <Download className="h-4 w-4" />
                  <span>Accept &amp; Save...</span>
                </button>
              </div>
            </div>
          )}

          {/* Transfer progress or completed */}
          {(fileReceiver.transferState === 'transferring' ||
            fileReceiver.transferState === 'completed') && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5 shadow-inner">
              <TransferProgress
                percentage={fileReceiver.stats.percentage}
                bytesTransferred={fileReceiver.stats.bytesTransferred}
                totalBytes={fileReceiver.stats.totalBytes}
                speedBytesPerSec={fileReceiver.stats.speedBytesPerSec}
                etaSeconds={fileReceiver.stats.etaSeconds}
                isComplete={fileReceiver.transferState === 'completed'}
              />

              {fileReceiver.transferState === 'completed' && (
                <div className="mt-4 pt-4 border-t border-neutral-800 text-center">
                  {fileReceiver.usedNativePicker ? (
                    <p className="text-xs sm:text-sm font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>File saved directly to your selected location on disk!</span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={fileReceiver.triggerFallbackDownload}
                      className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 text-xs sm:text-sm font-bold text-neutral-950 transition-colors hover:bg-yellow-300 active:scale-95 shadow-md"
                    >
                      <Download className="h-4 w-4" />
                      <span>Save Received File</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {fileReceiver.transferState === 'rejected' && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-center">
              <StatusMessage message="Transfer was declined or save cancelled." variant="warning" />
            </div>
          )}

          {fileReceiver.transferState === 'error' && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{fileReceiver.errorMessage || 'Storage access error occurred.'}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReceiverPage() {
  return (
    <Suspense fallback={<div className="text-center text-neutral-500 py-10 text-sm">Loading receiver...</div>}>
      <ReceiverContent />
    </Suspense>
  );
}
