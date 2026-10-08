import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../prisma/db.js';
// import * as argon2 from 'argon2';
import { SignJWT } from 'jose';
import 'dotenv/config';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input' });
    }

    const { email, password } = parsed.data;

    const user = await db.orm.public.User.select('id', 'passwordHash').where({ email }).first();

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // const isValid = await argon2.verify(user.passwordHash, password);
    const isValid = user.passwordHash === password;
    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const jwt = await new SignJWT({ sub: user.id, email })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(JWT_SECRET);

    return { token: jwt };
  });
}
