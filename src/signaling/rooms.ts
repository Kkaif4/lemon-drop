import { WebSocket } from 'ws';
import { randomBytes } from 'crypto';

export interface Room {
  id: string; // Long token
  shortCode: string;
  senderWs: WebSocket;
  receiverWs: WebSocket | null;
  createdAt: number;
  passwordHash?: string; // We'll use argon2id eventually
}

class RoomManager {
  private rooms = new Map<string, Room>();
  private shortCodes = new Map<string, string>(); // shortCode -> roomId

  constructor() {
    // Cleanup idle rooms every minute
    setInterval(() => this.cleanup(), 60000);
  }

  private generateShortCode(): string {
    let code;
    do {
      code = randomBytes(3).toString('hex').toUpperCase(); // 6 chars
    } while (this.shortCodes.has(code));
    return code;
  }

  createRoom(senderWs: WebSocket, passwordHash?: string): Room {
    const id = randomBytes(16).toString('hex');
    const shortCode = this.generateShortCode();
    
    const room: Room = {
      id,
      shortCode,
      senderWs,
      receiverWs: null,
      createdAt: Date.now(),
      passwordHash,
    };

    this.rooms.set(id, room);
    this.shortCodes.set(shortCode, id);
    return room;
  }

  getRoomById(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  getRoomByShortCode(code: string): Room | undefined {
    const id = this.shortCodes.get(code);
    if (!id) return undefined;
    return this.rooms.get(id);
  }

  joinRoom(roomId: string, receiverWs: WebSocket): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.receiverWs) {
      return false; // Room doesn't exist or already full
    }
    room.receiverWs = receiverWs;
    return true;
  }

  removeRoom(id: string) {
    const room = this.rooms.get(id);
    if (room) {
      this.shortCodes.delete(room.shortCode);
      this.rooms.delete(id);
    }
  }

  removeSocket(ws: WebSocket) {
    // Basic cleanup when a socket disconnects.
    // Real implementation might handle ICE restarts or allow reconnects within a window.
    for (const [id, room] of this.rooms.entries()) {
      if (room.senderWs === ws) {
        if (room.receiverWs) {
          room.receiverWs.send(JSON.stringify({ type: 'peer_disconnected' }));
        }
        this.removeRoom(id);
      } else if (room.receiverWs === ws) {
        room.senderWs.send(JSON.stringify({ type: 'peer_disconnected' }));
        room.receiverWs = null; // Let receiver reconnect
      }
    }
  }

  private cleanup() {
    const now = Date.now();
    // Expiry of 12 hours for an active transfer, or 10 mins if no receiver? 
    // For now, hardcode 2 hours max lifetime for memory safety.
    const EXPIRY = 2 * 60 * 60 * 1000;
    for (const [id, room] of this.rooms.entries()) {
      if (now - room.createdAt > EXPIRY) {
        room.senderWs.close();
        if (room.receiverWs) room.receiverWs.close();
        this.removeRoom(id);
      }
    }
  }
}

export const roomManager = new RoomManager();
