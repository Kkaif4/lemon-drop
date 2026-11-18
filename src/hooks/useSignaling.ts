// ─── useSignaling Hook ────────────────────────────────────────────────
// Manages the WebSocket connection to the signaling server.
// Handles room creation, joining, reconnection, heartbeat, and Render cold-start detection.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@/types/signaling';

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_URL || 'wss://lemon-drop.onrender.com/ws';

const HTTP_HEALTH_URL = SIGNALING_URL
  .replace(/^ws(s?):\/\//, 'http$1://')
  .replace(/\/ws\/?$/, '/health');

export type SignalingStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseSignalingReturn {
  status: SignalingStatus;
  roomCode: string | null;
  roomId: string | null;
  peerDeviceName: string | null;
  error: string | null;
  isWarmingUp: boolean;
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
  const [isWarmingUp, setIsWarmingUp] = useState(false);

  const pendingRef = useRef<ClientMessage[]>([]);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const warmupPollRef = useRef<NodeJS.Timeout | null>(null);
  const connectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isExplicitDisconnectRef = useRef(false);
  const roleRef = useRef<'sender' | 'receiver' | null>(null);

  const startWarmupCheck = useCallback(() => {
    if (warmupPollRef.current) return;
    setIsWarmingUp(true);

    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(HTTP_HEALTH_URL, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          if (warmupPollRef.current) {
            clearInterval(warmupPollRef.current);
            warmupPollRef.current = null;
          }
          setIsWarmingUp(false);
          // Trigger socket connection now that backend is warm
          connect();
          return;
        }
      } catch {
        // Backend still in Render free-tier spin-up
      }
    };

    warmupPollRef.current = setInterval(checkHealth, 3000);
    checkHealth();
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    isExplicitDisconnectRef.current = false;
    setStatus('connecting');
    setError(null);

    // If WebSocket does not open within 3.5s, trigger cold-start warm-up check
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = setTimeout(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        startWarmupCheck();
      }
    }, 3500);

    try {
      const ws = new WebSocket(SIGNALING_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        if (warmupPollRef.current) {
          clearInterval(warmupPollRef.current);
          warmupPollRef.current = null;
        }
        setIsWarmingUp(false);
        setStatus('connected');
        setError(null);

        // Flush any pending queue
        for (const msg of pendingRef.current) {
          ws.send(JSON.stringify(msg));
        }
        pendingRef.current = [];

        // Setup keep-alive ping every 20s for Render/Cloudflare proxies
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);

          switch (msg.type) {
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong' }));
              return;
            case 'pong':
              return;
            case 'room_created':
              setRoomCode(msg.shortCode);
              setRoomId(msg.roomId);
              break;
            case 'room_reconnected':
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
        if (!isExplicitDisconnectRef.current) {
          startWarmupCheck();
        }
      };

      ws.onclose = () => {
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        setStatus('disconnected');

        // Automatically recover and warm-up if dropped while active
        if (!isExplicitDisconnectRef.current && (pendingRef.current.length > 0 || roomCode)) {
          startWarmupCheck();
        }
      };
    } catch {
      startWarmupCheck();
    }
  }, [startWarmupCheck, roomCode]);

  const disconnect = useCallback(() => {
    isExplicitDisconnectRef.current = true;
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    if (warmupPollRef.current) {
      clearInterval(warmupPollRef.current);
      warmupPollRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsWarmingUp(false);
    setStatus('disconnected');
    setPeerDeviceName(null);
    setRoomCode(null);
    setRoomId(null);
    setError(null);
    pendingRef.current = [];
    roleRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      isExplicitDisconnectRef.current = true;
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      if (warmupPollRef.current) clearInterval(warmupPollRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
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
      roleRef.current = 'sender';
      connect();
      const msg: ClientMessage = { type: 'create_room', ...(password && { password }) };
      send(msg);
    },
    [connect, send],
  );

  const joinRoom = useCallback(
    (shortCode: string, password?: string, deviceName?: string) => {
      roleRef.current = 'receiver';
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
      const activeRole = roleRef.current || 'receiver';
      disconnect();
      setTimeout(() => {
        roleRef.current = activeRole;
        connect();
        setRoomCode(shortCode.toUpperCase());
        send({
          type: 'reconnect_room',
          shortCode: shortCode.toUpperCase(),
          role: activeRole,
        });
      }, 150);
    },
    [disconnect, connect, send],
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
    isWarmingUp,
    createRoom,
    joinRoom,
    reconnectRoom,
    disconnect,
    send,
    onMessage,
  };
}