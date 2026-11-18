import { z } from 'zod';

export const SignalMessageSchema = z.discriminatedUnion('type', [
  // Authentication & Room Creation (Sender)
  z.object({
    type: z.literal('create_room'),
    token: z.string().optional(), // JWT for owner verification
    password: z.string().optional(), // Optional room password
  }),
  // Reconnect Room
  z.object({
    type: z.literal('reconnect_room'),
    roomId: z.string().optional(),
    shortCode: z.string().optional(),
    role: z.enum(['sender', 'receiver']).optional(),
  }),
  // Room Joining (Receiver)
  z.object({
    type: z.literal('join_room'),
    roomId: z.string().optional(),
    shortCode: z.string().optional(),
    password: z.string().optional(),
    deviceName: z.string().optional(),
  }),
  // WebRTC Signaling
  z.object({
    type: z.literal('offer'),
    sdp: z.string(),
  }),
  z.object({
    type: z.literal('answer'),
    sdp: z.string(),
  }),
  z.object({
    type: z.literal('pubkey'),
    key: z.string(),
  }),
  z.object({
    type: z.literal('ice'),
    candidate: z.any(), // RTCIceCandidateInit
  }),
  // Application Control
  z.object({
    type: z.literal('accept'),
  }),
  z.object({
    type: z.literal('decline'),
  }),
  // Keep-alive Heartbeats
  z.object({
    type: z.literal('ping'),
  }),
  z.object({
    type: z.literal('pong'),
  }),
]);

export type SignalMessage = z.infer<typeof SignalMessageSchema>;
