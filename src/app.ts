import fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import 'dotenv/config';
import authRoutes from './auth/index.js';

export const buildApp = async () => {
  const app = fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Register WebSockets
  const fastifyWebsocket = await import('@fastify/websocket');
  await app.register(fastifyWebsocket.default);

  // Register HTTP routes
  app.register(authRoutes, { prefix: '/auth' });

  // Register WebSocket signaling routes
  const signalingRoutes = await import('./signaling/ws.js');
  app.register(signalingRoutes.default);

  return app;
};
