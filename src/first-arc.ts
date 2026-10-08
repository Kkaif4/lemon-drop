import 'dotenv/config';
import { db } from './prisma/db.js'; // The file is src/prisma/db.ts, but standard resolution might need .js or not, let's omit .js or use it. Actually TS module resolution might be fine without .js if tsx is used. Or I can just write './prisma/db' and see. Let's use './prisma/db'.

async function main() {
  // await db.orm.public.User.create({ email: 'alice@example.com' });
  const users = await db.orm.public.User.select('id', 'email').all();
  console.log('Successfully connected and executed first query:', users);
}

main().catch(console.error);
