import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { PrismaClient, Role } from '@prisma/client';
import { createApp } from '../src/app.js';
import { assertTransition, assertVersion } from '../src/domain.js';
import { hashPassword, verifyPassword, tokenHash, sessionToken } from '../src/security.js';
import { hoursInput, productInput, orderInput } from '../src/validation.js';

test('password hashes use unique salts; wrong passwords fail', async () => {
  const password = randomBytes(24).toString('hex');
  const a = await hashPassword(password); const b = await hashPassword(password);
  assert.notEqual(a, b); assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword(password + 'wrong', a), false);
  assert.equal(await verifyPassword(password, 'broken'), false);
  assert.ok(!a.includes(password));
});
test('session tokens have 256 bits of entropy and only hashes are persisted', () => {
  const a = sessionToken(); const b = sessionToken();
  assert.match(a, /^[a-f0-9]{64}$/); assert.notEqual(a, b); assert.notEqual(tokenHash(a), a);
});
test('staff prepare and cancel; only courier can pick up and complete', () => {
  for (const role of ['ADMIN', 'EMPLOYEE'] as const) {
    assert.doesNotThrow(() => assertTransition(role, 'NEW', 'PREPARING'));
    assert.doesNotThrow(() => assertTransition(role, 'PREPARING', 'READY'));
    assert.doesNotThrow(() => assertTransition(role, 'READY', 'CANCELLED'));
    assert.throws(() => assertTransition(role, 'READY', 'DELIVERING'));
    assert.throws(() => assertTransition(role, 'DELIVERING', 'COMPLETED'));
  }
  assert.doesNotThrow(() => assertTransition('COURIER', 'READY', 'DELIVERING'));
  assert.doesNotThrow(() => assertTransition('COURIER', 'DELIVERING', 'COMPLETED'));
  assert.throws(() => assertTransition('COURIER', 'NEW', 'PREPARING'));
  assert.throws(() => assertTransition('COURIER', 'PREPARING', 'DELIVERING'));
  assert.throws(() => assertTransition('COURIER', 'COMPLETED', 'DELIVERING'));
});
test('stale versions are rejected instead of overwriting a concurrent change', () => {
  assert.doesNotThrow(() => assertVersion(3, 3));
  assert.throws(() => assertVersion(3, 2), { code: 'VERSION_CONFLICT', status: 409 });
});
test('validation rejects price tampering, unknown roles and invalid schedules', () => {
  assert.equal(productInput.safeParse({ name: 'Osh', category: 'Taom', price: -1 }).success, false);
  assert.equal(productInput.safeParse({ name: 'Osh', category: 'Taom', price: 2000, restaurantId: 2 }).success, false);
  assert.equal(orderInput.safeParse({ restaurantId: 1, customer: 'A', address: 'B', total: 1, items: [{ productId: 1, quantity: 1 }] }).success, false);
  assert.equal(orderInput.safeParse({ restaurantId: 1, customer: 'A', address: 'B', items: [{ productId: 1, quantity: -1 }] }).success, false);
  assert.equal(hoursInput.safeParse(Array.from({ length: 7 }, () => ({ weekday: 0, start: '09:00', end: '23:00', enabled: true }))).success, false);
});

// HTTP contract tests use a deliberate DB stub. Real Prisma/PostgreSQL tests are
// separately gated by TEST_DATABASE_URL in postgres.test.ts.
const rawToken = sessionToken();
function fixture(role: Role = 'EMPLOYEE', expiresAt = new Date(Date.now() + 60_000)) {
  const captures: unknown[] = [];
  const fake = {
    session: { findUnique: async () => ({ expiresAt, user: { id: 1, name: 'Test', email: 'test@example.test', active: true, role, isDemo: false, employee: role === 'EMPLOYEE' ? { restaurantId: 10 } : null, courier: role === 'COURIER' ? { id: 7, restaurantId: 10 } : null } }) },
    order: { findFirst: async (args: unknown) => { captures.push(args); return null; } },
    restaurant: { findUnique: async () => null },
  };
  return { app: createApp(fake as unknown as PrismaClient, { origin: 'http://127.0.0.1:5173' }), captures };
}
const cookie = `tezkor_session=${rawToken}`;
test('anonymous API requests return structured 401 without leaking details', async () => {
  const { app } = fixture(); const res = await request(app).get('/api/v1/orders');
  assert.equal(res.status, 401); assert.equal(res.body.error.code, 'UNAUTHENTICATED'); assert.ok(res.body.error.requestId);
  assert.equal(res.headers['x-powered-by'], undefined); assert.equal(res.headers['cache-control'], 'no-store');
});
test('expired sessions are rejected', async () => {
  const { app } = fixture('EMPLOYEE', new Date(0));
  assert.equal((await request(app).get('/api/v1/me').set('Cookie', cookie)).status, 401);
});
test('cross-origin writes and ordinary form writes are rejected before touching the DB', async () => {
  const { app } = fixture();
  assert.equal((await request(app).post('/api/v1/auth/login').send({})).status, 403);
  const response = await request(app).post('/api/v1/auth/login').set('X-Requested-With', 'TezkorPartner').set('Origin', 'https://attacker.test').send({});
  assert.equal(response.status, 403); assert.equal(response.headers['access-control-allow-origin'], undefined);
});
test('employees cannot choose a different tenant through path or query', async () => {
  const { app } = fixture();
  assert.equal((await request(app).get('/api/v1/restaurants/11').set('Cookie', cookie)).status, 404);
  assert.equal((await request(app).get('/api/v1/products?restaurantId=11').set('Cookie', cookie)).status, 404);
});
test('resource lookup includes tenant and courier ownership filters', async () => {
  for (const role of ['EMPLOYEE', 'COURIER'] as const) {
    const { app, captures } = fixture(role);
    assert.equal((await request(app).get('/api/v1/orders/999').set('Cookie', cookie)).status, 404);
    const args = captures[0] as { where: { restaurantId: number; delivery?: { courierId: number } } };
    assert.equal(args.where.restaurantId, 10);
    if (role === 'COURIER') assert.equal(args.where.delivery?.courierId, 7);
  }
});
test('couriers cannot read menus or provision users; employees cannot create restaurants', async () => {
  const courier = fixture('COURIER').app;
  assert.equal((await request(courier).get('/api/v1/products').set('Cookie', cookie)).status, 403);
  const response = await request(courier).post('/api/v1/restaurants/10/employees').set('Cookie', cookie).set('X-Requested-With', 'TezkorPartner').send({});
  assert.equal(response.status, 403);
  assert.equal((await request(fixture().app).post('/api/v1/restaurants').set('Cookie', cookie).set('X-Requested-With', 'TezkorPartner').send({})).status, 403);
});
test('invalid input and malformed JSON return 400; sensitive fields are not accepted', async () => {
  const { app } = fixture();
  assert.equal((await request(app).post('/api/v1/auth/login').set('X-Requested-With', 'TezkorPartner').send({ email: 'invalid' })).status, 400);
  const res = await request(app).post('/api/v1/auth/login').set('X-Requested-With', 'TezkorPartner').set('Content-Type', 'application/json').send('{');
  assert.equal(res.status, 400); assert.equal(res.body.error.code, 'INVALID_JSON'); assert.equal(res.body.error.stack, undefined);
});

test('employees/couriers cannot list, create or deactivate platform-managed accounts', async () => {
  for (const role of ['EMPLOYEE', 'COURIER'] as const) {
    const { app } = fixture(role);
    assert.equal((await request(app).get('/api/v1/restaurants/10/accounts').set('Cookie', cookie)).status, 403);
    for (const path of ['/api/v1/restaurants/10/employees', '/api/v1/restaurants/10/couriers']) {
      assert.equal((await request(app).post(path).set('Cookie', cookie).set('X-Requested-With', 'TezkorPartner').send({ role: 'ADMIN' })).status, 403);
    }
    assert.equal((await request(app).patch('/api/v1/restaurants/10/accounts/1').set('Cookie', cookie).set('X-Requested-With', 'TezkorPartner').send({ active: false })).status, 403);
    const me = await request(app).get('/api/v1/me').set('Cookie', cookie);
    assert.equal(me.body.data.role, role);
  }
});
test('even an admin cannot grant ADMIN through employee/courier APIs or account PATCH', async () => {
  const { app } = fixture('ADMIN');
  const password = randomBytes(24).toString('hex');
  for (const kind of ['employees', 'couriers']) {
    const res = await request(app).post(`/api/v1/restaurants/10/${kind}`).set('Cookie', cookie).set('X-Requested-With', 'TezkorPartner').send({ name: 'Test', email: 'test@example.test', password, role: 'ADMIN' });
    assert.equal(res.status, 400);
  }
  assert.equal((await request(app).patch('/api/v1/restaurants/10/accounts/1').set('Cookie', cookie).set('X-Requested-With', 'TezkorPartner').send({ active: true, role: 'ADMIN' })).status, 400);
});
test('no HTTP bootstrap or public registration endpoint is exposed', async () => {
  const { app } = fixture();
  for (const path of ['/api/v1/auth/bootstrap', '/api/v1/auth/register']) {
    assert.equal((await request(app).post(path).set('Cookie', cookie).set('X-Requested-With', 'TezkorPartner').send({})).status, 404);
  }
});
