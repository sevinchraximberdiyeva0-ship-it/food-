import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Never print connection strings, error messages/stacks, credentials, or row data.
const db = new PrismaClient({ log: [] });
try {
  const [identity] = await db.$queryRaw`
    SELECT current_database() AS database, current_user AS username,
           current_setting('server_version') AS version
  `;
  if (identity.database !== 'tezkor_demo' || identity.username !== 'postgres') {
    console.log(JSON.stringify({ ok: false, code: 'UNEXPECTED_DATABASE_OR_USER' }));
    process.exitCode = 1;
  } else if (process.argv.includes('--preflight')) {
    console.log(JSON.stringify({ ok: true, ...identity }));
  } else {
    const tables = await db.$queryRaw`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name
    `;
    const expected = ['User', 'Session', 'PlatformBootstrap', 'Restaurant', 'Employee', 'Category', 'Product', 'Order', 'OrderItem', 'Courier', 'Delivery', 'Review', 'Promotion', 'WorkingHours'];
    const names = new Set(tables.map(t => t.name));
    const missingTables = expected.filter(name => !names.has(name));
    const migrations = names.has('_prisma_migrations') ? await db.$queryRaw`
      SELECT migration_name AS name, finished_at IS NOT NULL AS applied,
             rolled_back_at IS NOT NULL AS rolled_back
      FROM public._prisma_migrations ORDER BY started_at
    ` : [];
    const required = ['202611130001_phase2', '202611130002_constraints', '202611140001_admin_bootstrap'];
    const missingMigrations = required.filter(name => !migrations.some(m => m.name === name && m.applied && !m.rolled_back));
    const [index] = await db.$queryRaw`
      SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'Delivery_one_active_per_courier') AS present
    `;
    const ok = missingTables.length === 0 && missingMigrations.length === 0 && index.present;
    console.log(JSON.stringify({ ok, ...identity, tables: expected.filter(name => names.has(name)), migrations, missingTables, missingMigrations, activeCourierIndex: index.present }));
    if (!ok) process.exitCode = 1;
  }
} catch (error) {
  const code = typeof error?.code === 'string' && /^P\d{4}$/.test(error.code) ? error.code : 'CONNECTION_CHECK_FAILED';
  console.log(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
} finally {
  await db.$disconnect().catch(() => {});
}
