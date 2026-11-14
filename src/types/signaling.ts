// ─── Signaling Messages ───────────────────────────────────────────────
// Type-safe definitions for all WebSocket signaling messages between
// client ↔ server ↔ client.

/** Outbound: client → server */
export type ClientMessage =
  | { type: 'create_room'; password?: string; token?: string }
  | { type: 'join_room'; shortCode: string; password?: string; deviceName?: string; roomId?: string }
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit }
  | { type: 'pubkey'; key: string }
  | { type: 'accept' }
  | { type: 'decline' };

/** Inbound: server → client */
export type ServerMessage =
  | { type: 'room_created'; roomId: string; shortCode: string }
  | { type: 'peer_joined'; deviceName: string }
  | { type: 'joined'; roomId: string }
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit }
  | { type: 'pubkey'; key: string }
  | { type: 'peer_disconnected' }
  | { type: 'error'; message: string };
