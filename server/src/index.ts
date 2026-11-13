import { PrismaClient } from '@prisma/client';
import { config } from './config.js';
import { createApp } from './app.js';

const db = new PrismaClient();
try {
  await db.$connect();
  const server = createApp(db, { origin: config.APP_ORIGIN, production: config.NODE_ENV === 'production' }).listen(config.PORT, '127.0.0.1', () => console.log(`Tezkor API: http://127.0.0.1:${config.PORT}/api/v1`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => { void db.$disconnect().finally(() => process.exit(0)); }); });
} catch {
  console.error('API ishga tushmadi: PostgreSQL va DATABASE_URL ni tekshiring.');
  await db.$disconnect();
  process.exitCode = 1;
}
