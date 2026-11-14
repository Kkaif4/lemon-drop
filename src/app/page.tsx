'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useFileSender } from '@/hooks/useFileSender';
import DropZone from '@/components/DropZone';
import RoomShareCard from '@/components/RoomShareCard';
import ConnectionBadge from '@/components/ConnectionBadge';
import TransferProgress from '@/components/TransferProgress';
import StatusMessage from '@/components/StatusMessage';
import { ArrowRight, Sparkles, Send, Clock, RefreshCw } from 'lucide-react';

export default function SenderPage() {
  const [hasStartedRoom, setHasStartedRoom] = useState(false);
  const signaling = useSignaling();

  const webrtc = useWebRTC({
    isSender: true,
    send: signaling.send,
    onMessage: signaling.onMessage,
  });

  const fileSender = useFileSender({
    dataChannel: webrtc.dataChannel,
    e2ee: webrtc.e2ee,
  });

  const handleIncomingControlRef = useRef(fileSender.handleIncomingControl);
  useEffect(() => {
    handleIncomingControlRef.current = fileSender.handleIncomingControl;
  }, [fileSender.handleIncomingControl]);

  useEffect(() => {
    if (webrtc.dataChannel) {
      webrtc.dataChannel.onmessage = (event) => {
        handleIncomingControlRef.current(event.data);
      };
    }
  }, [webrtc.dataChannel]);

  const webrtcRef = useRef(webrtc);
  useEffect(() => {
    webrtcRef.current = webrtc;
  }, [webrtc]);

  useEffect(() => {
    signaling.onMessage(async (msg) => {
      if (msg.type === 'peer_joined') {
        await webrtcRef.current.initiate();
      } else {
        await webrtcRef.current.handleSignaling(msg);
      }
    });
  }, [signaling]);

  const handleStartSending = () => {
    setHasStartedRoom(true);
    signaling.createRoom();
  };

  const isConnected =
    webrtc.connectionState === 'connected' &&
    webrtc.dataChannel?.readyState === 'open';

  return (
    <div className="flex flex-col gap-5 sm:gap-6 w-full">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-neutral-900">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-100 flex items-center gap-2">
            Send Files
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Direct peer-to-peer stream without cloud storage
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <ConnectionBadge state={webrtc.connectionState} />
          <Link
            href="/r"
            className="inline-flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/80 px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 active:scale-95"
          >
            <span>Receive</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {!hasStartedRoom ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-6 sm:p-10 text-center shadow-lg">
          <div className="mb-4 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-yellow-400/10 text-3xl shadow-inner">
            🍋
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-neutral-100">
            Create an Instant Transfer Room
          </h2>
          <p className="mt-2 max-w-sm text-xs sm:text-sm text-neutral-400 leading-relaxed">
            Generate a secure pairing code. When the receiver connects, select
            your file to start direct transfer.
          </p>
          <button
            type="button"
            onClick={handleStartSending}
            className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 font-semibold text-neutral-950 transition-all hover:bg-yellow-300 active:scale-95 shadow-md shadow-yellow-500/10"
          >
            <Sparkles className="h-4 w-4" />
            <span>Generate Room Code</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 sm:gap-6">
          {/* Room Code Card */}
          <RoomShareCard roomCode={signaling.roomCode} />

          {/* Peer connection feedback */}
          <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3.5 sm:p-4 text-xs sm:text-sm">
            {signaling.peerDeviceName ? (
              <StatusMessage
                message={`Connected to ${signaling.peerDeviceName}. Select a file to send.`}
                variant="success"
              />
            ) : webrtc.connectionState === 'disconnected' || webrtc.connectionState === 'closed' ? (
              <StatusMessage
                message="Receiver disconnected. Keep this page open for them to reconnect."
                variant="warning"
              />
            ) : (
              <StatusMessage
                message="Waiting for receiver to enter code..."
                variant="info"
              />
            )}
            {signaling.error && (
              <StatusMessage message={signaling.error} variant="error" />
            )}
          </div>

          {/* Dropzone */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-medium text-neutral-400 px-1">
              <span>Select File</span>
              {!isConnected && (
                <span className="text-yellow-500/80 text-[11px] sm:text-xs">
                  Unlocks once receiver enters code
                </span>
              )}
            </div>

            <DropZone
              onFileSelect={fileSender.selectFile}
              selectedFile={fileSender.selectedFile}
              disabled={
                !isConnected || fileSender.transferState === 'transferring'
              }
            />
          </div>

          {/* Action button */}
          {fileSender.selectedFile &&
            isConnected &&
            fileSender.transferState === 'idle' && (
              <button
                type="button"
                onClick={fileSender.startTransfer}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3.5 font-bold text-neutral-950 transition-all hover:bg-yellow-300 active:scale-98 shadow-md shadow-yellow-500/10 text-sm sm:text-base"
              >
                <Send className="h-4 w-4" />
                <span>Start Transfer</span>
              </button>
            )}

          {fileSender.transferState === 'waiting-for-acceptance' && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-center animate-pulse">
              <p className="text-xs sm:text-sm font-semibold text-yellow-300 flex items-center justify-center gap-1.5">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  Waiting for receiver to accept and choose save folder...
                </span>
              </p>
            </div>
          )}

          {fileSender.transferState === 'rejected' && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
              <StatusMessage
                message="Receiver declined the transfer or canceled file selection."
                variant="error"
              />
              <button
                type="button"
                onClick={fileSender.startTransfer}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs text-neutral-200 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Try Sending Again</span>
              </button>
            </div>
          )}

          {(fileSender.transferState === 'transferring' ||
            fileSender.transferState === 'completed') && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5 shadow-inner">
              <TransferProgress
                percentage={fileSender.stats.percentage}
                bytesTransferred={fileSender.stats.bytesTransferred}
                totalBytes={fileSender.stats.totalBytes}
                speedBytesPerSec={fileSender.stats.speedBytesPerSec}
                etaSeconds={fileSender.stats.etaSeconds}
                isComplete={fileSender.transferState === 'completed'}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
