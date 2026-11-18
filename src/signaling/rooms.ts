import { WebSocket } from 'ws';
import { randomBytes } from 'crypto';

export interface Room {
  id: string; // Long token
  shortCode: string;
  senderWs: WebSocket;
  receiverWs: WebSocket | null;
  createdAt: number;
  passwordHash?: string; // We'll use argon2id eventually
  cleanupTimer?: NodeJS.Timeout;
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

  reconnectSocket(codeOrId: string, ws: WebSocket, role: 'sender' | 'receiver' = 'sender'): Room | null {
    let room = this.rooms.get(codeOrId);
    if (!room) {
      const id = this.shortCodes.get(codeOrId.toUpperCase());
      if (id) {
        room = this.rooms.get(id);
      }
    }
    if (!room) return null;

    if (role === 'sender') {
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = undefined;
      }
      room.senderWs = ws;
      return room;
    } else {
      room.receiverWs = ws;
      return room;
    }
  }

  removeRoom(id: string) {
    const room = this.rooms.get(id);
    if (room) {
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = undefined;
      }
      this.shortCodes.delete(room.shortCode);
      this.rooms.delete(id);
    }
  }

  removeSocket(ws: WebSocket) {
    for (const [id, room] of this.rooms.entries()) {
      if (room.senderWs === ws) {
        if (room.receiverWs) {
          try {
            room.receiverWs.send(JSON.stringify({ type: 'peer_disconnected' }));
          } catch {
            // ignore
          }
        }
        // Give 60 seconds grace period for sender to reconnect or recover from network jitter/sleep
        if (!room.cleanupTimer) {
          room.cleanupTimer = setTimeout(() => {
            this.removeRoom(id);
          }, 60000);
        }
      } else if (room.receiverWs === ws) {
        if (room.senderWs) {
          try {
            room.senderWs.send(JSON.stringify({ type: 'peer_disconnected' }));
          } catch {
            // ignore
          }
        }
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
