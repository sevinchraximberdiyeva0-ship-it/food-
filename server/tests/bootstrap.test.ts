import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { bootstrapFirstAdmin, bootstrapStatus, bootstrapKey } from '../src/bootstrap.js';
import { verifyPassword } from '../src/security.js';

interface TestUser { id: number; email: string; name: string; passwordHash: string; role: string; active: boolean; isDemo: boolean }
interface Receipt { key: string; createdAdminId: number }
function fixture(options: { existing?: Partial<TestUser>; receipt?: boolean; failReceipt?: boolean } = {}) {
  let users: TestUser[] = options.existing ? [{ id: 1, email: 'existing@example.test', name: 'Existing', passwordHash: 'untouched', role: 'ADMIN', active: false, isDemo: false, ...options.existing }] : [];
  let receipt: Receipt | null = options.receipt ? { key: bootstrapKey, createdAdminId: 999 } : null;
  let queue = Promise.resolve(); let locks = 0;
  const count = (list: TestUser[]) => list.filter(u => u.role === 'ADMIN').length;
  const db = {
    user: { count: async () => count(users) },
    platformBootstrap: { findUnique: async () => receipt },
    $transaction: async (work: (tx: unknown) => Promise<unknown>, config: { isolationLevel: string }) => {
      assert.equal(config.isolationLevel, 'ReadCommitted');
      const preceding = queue; let release!: () => void;
      queue = new Promise<void>(resolve => { release = resolve; }); await preceding;
      const nextUsers = [...users]; let nextReceipt = receipt;
      try {
        const result = await work({
          $executeRaw: async (sql: TemplateStringsArray) => { assert.ok(sql.join('').includes('pg_advisory_xact_lock')); locks++; return 1; },
          user: {
            count: async () => count(nextUsers),
            create: async ({ data }: { data: Omit<TestUser, 'id'> }) => {
              if (nextUsers.some(u => u.email === data.email)) throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
              const user = { id: nextUsers.length + 1, ...data }; nextUsers.push(user); return { id: user.id, role: user.role };
            },
          },
          platformBootstrap: {
            findUnique: async () => nextReceipt,
            create: async ({ data }: { data: Receipt }) => { if (options.failReceipt) throw new Error('simulated metadata failure'); nextReceipt = data; return data; },
          },
        });
        users = nextUsers; receipt = nextReceipt; return result;
      } finally { release(); }
    },
  } as unknown as PrismaClient;
  return { db, users: () => users, receipt: () => receipt, locks: () => locks };
}
const input = () => ({ email: 'First@EXAMPLE.TEST', name: 'Test first admin', password: randomUUID() + randomUUID() });

test('first bootstrap uses existing ADMIN as SUPER ADMIN, hashes password and stores singleton receipt', async () => {
  const f = fixture(); const credentials = input();
  assert.equal((await bootstrapStatus(f.db)).available, true);
  const result = await bootstrapFirstAdmin(f.db, credentials);
  assert.deepEqual(result, { id: 1, role: 'ADMIN' }); assert.equal(f.users().length, 1);
  const saved = f.users()[0]; assert.equal(saved.email, 'first@example.test'); assert.equal(saved.isDemo, false); assert.equal(saved.active, true);
  assert.notEqual(saved.passwordHash, credentials.password); assert.equal(await verifyPassword(credentials.password, saved.passwordHash), true);
  assert.deepEqual(f.receipt(), { key: bootstrapKey, createdAdminId: 1 }); assert.equal(f.locks(), 1);
  assert.equal((await bootstrapStatus(f.db)).available, false);
});
test('second bootstrap is refused and never changes the first password', async () => {
  const f = fixture(); await bootstrapFirstAdmin(f.db, input()); const hash = f.users()[0].passwordHash;
  await assert.rejects(bootstrapFirstAdmin(f.db, { ...input(), email: 'second@example.test' }), { code: 'BOOTSTRAP_CLOSED' });
  assert.equal(f.users().length, 1); assert.equal(f.users()[0].passwordHash, hash);
});
test('inactive or demo ADMIN also closes bootstrap without changing the account', async () => {
  for (const isDemo of [true, false]) {
    const f = fixture({ existing: { active: false, isDemo } });
    assert.equal((await bootstrapStatus(f.db)).available, false);
    await assert.rejects(bootstrapFirstAdmin(f.db, input()), { code: 'BOOTSTRAP_CLOSED' });
    assert.equal(f.users()[0].passwordHash, 'untouched'); assert.equal(f.receipt(), null);
  }
});
test('permanent receipt keeps bootstrap closed even if the original admin is no longer present', async () => {
  const f = fixture({ receipt: true });
  await assert.rejects(bootstrapFirstAdmin(f.db, input()), { code: 'BOOTSTRAP_CLOSED' }); assert.equal(f.users().length, 0);
});
test('parallel bootstrap requests yield exactly one winner under the lock', async () => {
  const f = fixture();
  const outcomes = await Promise.allSettled([bootstrapFirstAdmin(f.db, input()), bootstrapFirstAdmin(f.db, { ...input(), email: 'other@example.test' })]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(r => r.status === 'rejected').length, 1); assert.equal(f.users().length, 1); assert.ok(f.receipt());
});
test('receipt write failure rolls back account creation', async () => {
  const f = fixture({ failReceipt: true });
  await assert.rejects(bootstrapFirstAdmin(f.db, input()), { code: 'BOOTSTRAP_FAILED' }); assert.equal(f.users().length, 0); assert.equal(f.receipt(), null);
});
test('invalid input or requested role escalation is rejected before any DB writes', async () => {
  const f = fixture();
  for (const data of [{ ...input(), email: 'bad' }, { ...input(), password: 'short' }, { ...input(), role: 'ADMIN' }, { ...input(), isDemo: true }]) {
    await assert.rejects(bootstrapFirstAdmin(f.db, data), { code: 'INVALID_INPUT' });
  }
  assert.equal(f.locks(), 0); assert.equal(f.users().length, 0);
});
test('existing non-admin email is not overwritten or promoted', async () => {
  const f = fixture({ existing: { role: 'EMPLOYEE', email: 'first@example.test' } });
  await assert.rejects(bootstrapFirstAdmin(f.db, input()), { code: 'ACCOUNT_OR_BOOTSTRAP_EXISTS' });
  assert.equal(f.users()[0].role, 'EMPLOYEE'); assert.equal(f.users()[0].passwordHash, 'untouched');
});
