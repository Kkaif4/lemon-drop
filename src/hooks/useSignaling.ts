// ─── useSignaling Hook ────────────────────────────────────────────────
// Manages the WebSocket connection to the signaling server.
// Handles room creation, joining, reconnection, and disconnection.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@/types/signaling';

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_URL || 'wss://lemon-drop.onrender.com/ws';

export type SignalingStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseSignalingReturn {
  status: SignalingStatus;
  roomCode: string | null;
  roomId: string | null;
  peerDeviceName: string | null;
  error: string | null;
  createRoom: (password?: string) => void;
  joinRoom: (shortCode: string, password?: string, deviceName?: string) => void;
  reconnectRoom: (shortCode: string) => void;
  disconnect: () => void;
  send: (msg: ClientMessage) => void;
  onMessage: (handler: (msg: ServerMessage) => void) => void;
}

export function useSignaling(): UseSignalingReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef<((msg: ServerMessage) => void) | null>(null);
  const [status, setStatus] = useState<SignalingStatus>('disconnected');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [peerDeviceName, setPeerDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<ClientMessage[]>([]);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    setStatus('connecting');
    setError(null);
    const ws = new WebSocket(SIGNALING_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      for (const msg of pendingRef.current) {
        ws.send(JSON.stringify(msg));
      }
      pendingRef.current = [];
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);

        switch (msg.type) {
          case 'room_created':
            setRoomCode(msg.shortCode);
            setRoomId(msg.roomId);
            break;
          case 'peer_joined':
            setPeerDeviceName(msg.deviceName);
            break;
          case 'joined':
            setRoomId(msg.roomId);
            break;
          case 'peer_disconnected':
            setPeerDeviceName(null);
            break;
          case 'error':
            setError(msg.message);
            break;
        }

        handlerRef.current?.(msg);
      } catch {
        console.error('[Signaling] Failed to parse message');
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setError('WebSocket connection error');
    };

    ws.onclose = () => {
      setStatus('disconnected');
    };
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
    setPeerDeviceName(null);
    setRoomCode(null);
    setRoomId(null);
    setError(null);
    pendingRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      pendingRef.current.push(msg);
    }
  }, []);

  const createRoom = useCallback(
    (password?: string) => {
      connect();
      const msg: ClientMessage = { type: 'create_room', ...(password && { password }) };
      send(msg);
    },
    [connect, send],
  );

  const joinRoom = useCallback(
    (shortCode: string, password?: string, deviceName?: string) => {
      connect();
      setRoomCode(shortCode.toUpperCase());
      const msg: ClientMessage = {
        type: 'join_room',
        shortCode: shortCode.toUpperCase(),
        ...(password && { password }),
        ...(deviceName && { deviceName }),
      };
      send(msg);
    },
    [connect, send],
  );

  const reconnectRoom = useCallback(
    (shortCode: string) => {
      disconnect();
      setTimeout(() => {
        joinRoom(shortCode);
      }, 100);
    },
    [disconnect, joinRoom],
  );

  const onMessage = useCallback((handler: (msg: ServerMessage) => void) => {
    handlerRef.current = handler;
  }, []);

  return {
    status,
    roomCode,
    roomId,
    peerDeviceName,
    error,
    createRoom,
    joinRoom,
    reconnectRoom,
    disconnect,
    send,
    onMessage,
  };
}
