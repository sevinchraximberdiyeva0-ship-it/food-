import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { bootstrapFirstAdmin, bootstrapStatus, BootstrapError } from './bootstrap.js';

const db = new PrismaClient({ log: [] });
try {
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ ok: true, ...(await bootstrapStatus(db)), role: 'ADMIN', displayRole: 'SUPER_ADMIN' }));
  } else if (process.argv.includes('--apply') && !process.stdin.isTTY) {
    // Credentials arrive only through the local terminal launcher's private
    // stdin pipe. Never read them from env vars, args, files, or HTTP requests.
    let payload = '';
    for await (const chunk of process.stdin) {
      payload += chunk.toString();
      if (Buffer.byteLength(payload) > 8192) throw new BootstrapError('INPUT_TOO_LARGE');
    }
    let input: unknown;
    try { input = JSON.parse(payload); } catch { throw new BootstrapError('INVALID_INPUT'); }
    payload = '';
    await bootstrapFirstAdmin(db, input);
    input = undefined;
    console.log(JSON.stringify({ ok: true, created: true, role: 'ADMIN', displayRole: 'SUPER_ADMIN' }));
  } else {
    console.log(JSON.stringify({ ok: false, code: 'USE_LOCAL_BOOTSTRAP_TERMINAL' }));
    process.exitCode = 1;
  }
} catch (error) {
  const code = error instanceof BootstrapError ? error.code : 'BOOTSTRAP_CHECK_FAILED';
  // Never expose raw Prisma/Zod exceptions, input, email, password, or DB URL.
  console.log(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
} finally { await db.$disconnect().catch(() => {}); }
