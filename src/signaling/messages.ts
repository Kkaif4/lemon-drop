import { z } from 'zod';

export const SignalMessageSchema = z.discriminatedUnion('type', [
  // Authentication & Room Creation (Sender)
  z.object({
    type: z.literal('create_room'),
    token: z.string().optional(), // JWT for owner verification
    password: z.string().optional(), // Optional room password
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
]);

export type SignalMessage = z.infer<typeof SignalMessageSchema>;
