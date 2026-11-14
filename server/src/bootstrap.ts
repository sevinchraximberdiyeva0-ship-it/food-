import { Prisma, type PrismaClient } from '@prisma/client';
import { hashPassword } from './security.js';
import { userInput } from './validation.js';

export const bootstrapKey = 'first-platform-admin';
export class BootstrapError extends Error {
  constructor(public code: string) { super(code); }
}

export async function bootstrapStatus(db: PrismaClient) {
  const [adminCount, receipt] = await Promise.all([
    // Any ADMIN, including inactive/demo, closes bootstrap conservatively.
    db.user.count({ where: { role: 'ADMIN' } }),
    db.platformBootstrap.findUnique({ where: { key: bootstrapKey }, select: { key: true } }),
  ]);
  return { available: adminCount === 0 && receipt === null, adminExists: adminCount > 0, completed: receipt !== null };
}

export async function bootstrapFirstAdmin(db: PrismaClient, input: unknown) {
  const parsed = userInput.safeParse(input);
  if (!parsed.success) throw new BootstrapError('INVALID_INPUT');
  // Hash before taking the DB lock. Never accept client role/active/isDemo/hash.
  const passwordHash = await hashPassword(parsed.data.password);
  try {
    return await db.$transaction(async tx => {
      // All bootstrap processes use the same transaction-scoped PostgreSQL lock.
      // READ COMMITTED sees a preceding winner's commit after waiting for it.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1865301, 1)`;
      const receipt = await tx.platformBootstrap.findUnique({ where: { key: bootstrapKey } });
      if (receipt || await tx.user.count({ where: { role: 'ADMIN' } }) > 0) throw new BootstrapError('BOOTSTRAP_CLOSED');
      const user = await tx.user.create({
        data: { email: parsed.data.email, name: parsed.data.name, passwordHash, role: 'ADMIN', active: true, isDemo: false },
        select: { id: true, role: true },
      });
      await tx.platformBootstrap.create({ data: { key: bootstrapKey, createdAdminId: user.id } });
      return user;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 });
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BootstrapError('ACCOUNT_OR_BOOTSTRAP_EXISTS');
    throw new BootstrapError('BOOTSTRAP_FAILED');
  }
}
