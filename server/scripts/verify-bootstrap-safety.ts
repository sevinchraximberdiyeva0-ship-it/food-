import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { bootstrapStatus } from '../src/bootstrap.js';

// READ ONLY: does not call bootstrapFirstAdmin and cannot create any account.
const db = new PrismaClient({ log: [] });
try {
  const before = await bootstrapStatus(db);
  let signalHeld!: () => void; let releaseLock!: () => void;
  const held = new Promise<void>(resolve => { signalHeld = resolve; });
  const release = new Promise<void>(resolve => { releaseLock = resolve; });
  const owner = db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1865301, 1)`;
    signalHeld(); await release;
  }, { timeout: 10_000 });
  // If acquisition fails, propagate instead of hanging on the signal promise.
  await Promise.race([held, owner.then(() => { throw new Error('Lock owner ended unexpectedly'); })]);
  let concurrentBlocked: boolean;
  try {
    const [attempt] = await db.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(1865301, 1) AS acquired`;
    concurrentBlocked = !attempt.acquired;
  } finally { releaseLock(); await owner; }
  const after = await bootstrapStatus(db);
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  if (!concurrentBlocked || !unchanged) throw new Error('Safety check failed');
  console.log(JSON.stringify({ ok: true, concurrentLockBlocked: concurrentBlocked, bootstrapStatusUnchanged: unchanged, realAccountCreated: false, status: after }));
} catch {
  console.error(JSON.stringify({ ok: false, code: 'BOOTSTRAP_SAFETY_CHECK_FAILED', realAccountCreated: false })); process.exitCode = 1;
} finally { await db.$disconnect(); }
