import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { SignalMessageSchema } from './messages.js';
import { roomManager } from './rooms.js';
// import * as argon2 from 'argon2';

export default async function signalingRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    // We treat the Fastify WebSocket connection as a raw ws WebSocket
    const ws = socket as unknown as WebSocket;

    let currentRoomId: string | null = null;
    let isSender = false;

    // Heartbeat: ping active clients every 25s to keep Render / Cloudflare proxy alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch {
          // ignore
        }
      }
    }, 25000);

    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        const parsed = SignalMessageSchema.safeParse(data);

        if (!parsed.success) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
          return;
        }

        const msg = parsed.data;

        switch (msg.type) {
          case 'ping': {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
            break;
          }

          case 'pong': {
            break;
          }

          case 'reconnect_room': {
            const codeOrId = msg.shortCode || msg.roomId;
            if (!codeOrId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Missing room identifier' }));
              return;
            }
            const room = roomManager.reconnectSocket(codeOrId, ws, msg.role || 'sender');
            if (!room) {
              ws.send(JSON.stringify({ type: 'error', message: 'Room not found or expired' }));
              return;
            }
            currentRoomId = room.id;
            isSender = msg.role !== 'receiver';
            ws.send(JSON.stringify({
              type: 'room_reconnected',
              roomId: room.id,
              shortCode: room.shortCode,
              hasPeer: !!(isSender ? room.receiverWs : room.senderWs)
            }));
            break;
          }

          case 'create_room': {
            // TODO: Validate msg.token (JWT) to ensure Sender is authenticated
            let hash = undefined;
            if (msg.password) {
              // hash = await argon2.hash(msg.password);
              hash = msg.password; // temp bypass for segfault
            }
            const room = roomManager.createRoom(ws, hash);
            currentRoomId = room.id;
            isSender = true;
            ws.send(JSON.stringify({
              type: 'room_created',
              roomId: room.id,
              shortCode: room.shortCode
            }));
            break;
          }

          case 'join_room': {
            const room = msg.roomId 
              ? roomManager.getRoomById(msg.roomId) 
              : (msg.shortCode ? roomManager.getRoomByShortCode(msg.shortCode) : undefined);

            if (!room) {
              ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
              return;
            }

            if (room.passwordHash) {
              // if (!msg.password || !(await argon2.verify(room.passwordHash, msg.password))) {
              if (!msg.password || room.passwordHash !== msg.password) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid password' }));
                return;
              }
            }

            if (!roomManager.joinRoom(room.id, ws)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
              return;
            }

            currentRoomId = room.id;
            isSender = false;
            
            // Notify sender
            room.senderWs.send(JSON.stringify({ type: 'peer_joined', deviceName: msg.deviceName || 'Unknown Device' }));
            ws.send(JSON.stringify({ type: 'joined', roomId: room.id }));
            break;
          }

          case 'offer':
          case 'answer':
          case 'ice':
          case 'pubkey':
          case 'accept':
          case 'decline': {
            if (!currentRoomId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
              return;
            }

            const room = roomManager.getRoomById(currentRoomId);
            if (!room) return;

            // Route message to the peer
            const peer = isSender ? room.receiverWs : room.senderWs;
            if (peer) {
              peer.send(JSON.stringify(msg));
            }
            break;
          }
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Server error parsing message' }));
      }
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      roomManager.removeSocket(ws);
    });
  });
}
