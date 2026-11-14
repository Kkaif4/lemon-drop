// ─── useWebRTC Hook ───────────────────────────────────────────────────
// Manages the RTCPeerConnection lifecycle, ICE candidates, and
// DataChannel for binary file transfer.
//
// This hook does NOT handle file transfer logic — it only provides the
// transport layer. useFileSender / useFileReceiver sit on top.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@/types/signaling';
import type { ConnectionState } from '@/types/transfer';
import { E2EE } from '@/lib/crypto';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface UseWebRTCArgs {
  isSender: boolean;
  send: (msg: ClientMessage) => void;
  onMessage: (handler: (msg: ServerMessage) => void) => void;
}

interface UseWebRTCReturn {
  connectionState: ConnectionState;
  dataChannel: RTCDataChannel | null;
  e2ee: E2EE;
  /** Start the WebRTC handshake — called after signaling connects */
  initiate: () => Promise<void>;
  /** Process an incoming signaling message (offer/answer/ice/pubkey) */
  handleSignaling: (msg: ServerMessage) => Promise<void>;
}

export function useWebRTC({ isSender, send }: UseWebRTCArgs): UseWebRTCReturn {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const e2eeRef = useRef(new E2EE());
  const onReadyRef = useRef<(() => void) | null>(null);
  const onMessageRef = useRef<((data: ArrayBuffer) => void) | null>(null);

  // Expose e2ee instance via a stable ref
  const e2ee = e2eeRef.current;

  const setupDataChannel = useCallback((channel: RTCDataChannel) => {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 65536; // 64KB

    channel.onopen = () => {
      setDataChannel(channel);
      setConnectionState('connected');
    };
    channel.onclose = () => {
      setConnectionState('closed');
    };
    channel.onerror = (err) => {
      console.error('[WebRTC] DataChannel error:', err);
      setConnectionState('failed');
    };
    channel.onmessage = (event) => {
      onMessageRef.current?.(event.data);
    };
  }, []);

  const initiate = useCallback(async () => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({ type: 'ice', candidate: event.candidate.toJSON() });
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      switch (state) {
        case 'checking':
          setConnectionState('connecting');
          break;
        case 'connected':
        case 'completed':
          setConnectionState('connected');
          break;
        case 'disconnected':
          setConnectionState('disconnected');
          break;
        case 'failed':
          setConnectionState('failed');
          break;
        case 'closed':
          setConnectionState('closed');
          break;
      }
    };

    if (isSender) {
      // Sender creates the DataChannel
      const channel = pc.createDataChannel('transfer', { ordered: true });
      setupDataChannel(channel);
    } else {
      // Receiver waits for the DataChannel
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }

    // Generate and send our E2EE public key
    const myPubKey = await e2eeRef.current.generateKeyPair();
    const base64Key = btoa(String.fromCharCode(...myPubKey));
    send({ type: 'pubkey', key: base64Key });
  }, [isSender, send, setupDataChannel]);

  const handleSignaling = useCallback(
    async (msg: ServerMessage) => {
      const pc = pcRef.current;

      switch (msg.type) {
        case 'pubkey': {
          const pubKeyBytes = new Uint8Array(
            atob(msg.key)
              .split('')
              .map((c) => c.charCodeAt(0)),
          );
          await e2eeRef.current.setPeerPublicKey(pubKeyBytes);
          await e2eeRef.current.deriveSessionKey();

          // Sender creates the offer after key exchange
          if (isSender && pc) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send({ type: 'offer', sdp: offer.sdp! });
          }
          break;
        }

        case 'offer': {
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            send({ type: 'answer', sdp: answer.sdp! });
          }
          break;
        }

        case 'answer': {
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
          }
          break;
        }

        case 'ice': {
          if (pc) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch (e) {
              console.error('[WebRTC] Error adding ICE candidate:', e);
            }
          }
          break;
        }
      }
    },
    [isSender, send],
  );

  // Provide a way for external hooks to listen to DataChannel messages
  const setOnDataChannelMessage = useCallback((handler: (data: ArrayBuffer) => void) => {
    onMessageRef.current = handler;
  }, []);

  // Attach the handler setter to the return so parent hooks can use it
  // We do this via a ref that's readable
  (useWebRTC as any).__setOnMessage = setOnDataChannelMessage;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, []);

  return {
    connectionState,
    dataChannel,
    e2ee,
    initiate,
    handleSignaling,
  };
}

/**
 * Utility to set the DataChannel onmessage handler from outside the hook.
 * Call this in useFileSender / useFileReceiver.
 */
export function setDataChannelHandler(
  dataChannel: RTCDataChannel | null,
  handler: (data: ArrayBuffer) => void,
): void {
  if (dataChannel) {
    dataChannel.onmessage = (event) => handler(event.data);
  }
}
