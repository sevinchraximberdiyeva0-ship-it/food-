import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type Role } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/security.js';

const url = process.env.TEST_DATABASE_URL;
test('PostgreSQL: auth, two-tenant isolation, snapshots, courier flow and concurrent assignment', { skip: !url && 'TEST_DATABASE_URL is not set; real database tests were NOT run' }, async t => {
  if (!url || !new URL(url).pathname.slice(1).endsWith('_test')) throw new Error('TEST_DATABASE_URL must point to a separate *_test database.');
  const db = new PrismaClient({ datasourceUrl: url });
  const app = createApp(db, { origin: 'http://127.0.0.1:5173' });
  const tag = randomUUID(); const password = randomUUID() + randomUUID(); const passwordHash = await hashPassword(password);
  const tenantIds: number[] = []; const userIds: number[] = [];
  const write = (agent: ReturnType<typeof request.agent>, path: string, body: object) => agent.post('/api/v1' + path).set('X-Requested-With', 'TezkorPartner').send(body);
  try {
    const a = await db.restaurant.create({ data: { name: 'test A ' + tag, phone: 'test', address: 'test' } }); tenantIds.push(a.id);
    const b = await db.restaurant.create({ data: { name: 'test B ' + tag, phone: 'test', address: 'test' } }); tenantIds.push(b.id);
    async function account(role: Role, restaurantId: number, suffix: string) {
      const user = await db.user.create({ data: { email: `${suffix}-${tag}@example.test`, name: suffix, role, passwordHash, ...(role === 'EMPLOYEE' ? { employee: { create: { restaurantId } } } : role === 'COURIER' ? { courier: { create: { restaurantId } } } : {}) }, include: { courier: true } });
      userIds.push(user.id); const agent = request.agent(app);
      const login = await write(agent, '/auth/login', { email: user.email, password }); assert.equal(login.status, 200);
      const cookies = login.headers['set-cookie'] as unknown as string[];
      assert.ok(cookies.some(c => c.includes('HttpOnly') && c.includes('SameSite=Strict')));
      assert.equal(JSON.stringify(login.body).includes(passwordHash), false);
      return { agent, user };
    }
    const employeeA = await account('EMPLOYEE', a.id, 'staff-a'); const employeeB = await account('EMPLOYEE', b.id, 'staff-b');
    const courierA = await account('COURIER', a.id, 'courier-a'); const courierA2 = await account('COURIER', a.id, 'courier-a2');
    const courierB = await account('COURIER', b.id, 'courier-b');
    const categoryA = await db.category.create({ data: { restaurantId: a.id, name: 'Taom' } });
    const categoryB = await db.category.create({ data: { restaurantId: b.id, name: 'Taom' } });
    const productA = await db.product.create({ data: { restaurantId: a.id, categoryId: categoryA.id, name: 'Osh', price: 42000 } });
    const productB = await db.product.create({ data: { restaurantId: b.id, categoryId: categoryB.id, name: 'Kabob', price: 72000 } });
    const create = () => write(employeeA.agent, '/orders', { restaurantId: a.id, customer: 'Private customer', address: 'Private address', items: [{ productId: productA.id, quantity: 2 }] });
    const created = await create(); assert.equal(created.status, 201); const orderId = created.body.data.id;
    await t.test('server computes totals and immutable item price/name snapshots', async () => {
      assert.equal(created.body.data.total, 84000);
      await db.product.update({ where: { id: productA.id }, data: { price: 99000, name: 'Renamed' } });
      const saved = await db.order.findUniqueOrThrow({ where: { id: Number(orderId) }, include: { items: true } });
      assert.equal(saved.total, 84000); assert.equal(saved.items[0].name, 'Osh'); assert.equal(saved.items[0].price, 42000);
    });
    await t.test('tenant B cannot read/mutate tenant A resources, even with spoofed IDs', async () => {
      assert.equal((await employeeB.agent.get(`/api/v1/orders/${orderId}`)).status, 404);
      assert.equal((await employeeB.agent.get(`/api/v1/state?restaurantId=${a.id}`)).status, 404);
      assert.equal((await write(employeeB.agent, `/orders/${orderId}/transitions`, { to: 'PREPARING', expectedVersion: 1 })).status, 404);
      const patch = await employeeB.agent.patch(`/api/v1/products/${productA.id}`).set('X-Requested-With', 'TezkorPartner').send({ available: false }); assert.equal(patch.status, 404);
      assert.equal((await write(employeeA.agent, '/orders', { restaurantId: a.id, customer: 'Test', address: 'Test', items: [{ productId: productB.id, quantity: 1 }] })).status, 422);
    });
    await t.test('composite foreign keys reject cross-tenant data even through direct Prisma calls', async () => {
      await assert.rejects(db.product.create({ data: { restaurantId: a.id, categoryId: categoryB.id, name: 'Invalid', price: 1000 } }));
      await assert.rejects(db.delivery.create({ data: { restaurantId: a.id, orderId: Number(orderId), courierId: courierB.user.courier!.id } }));
    });
    await t.test('status progression rejects stale versions and unauthorized staff completion', async () => {
      assert.equal((await write(employeeA.agent, `/orders/${orderId}/transitions`, { to: 'PREPARING', expectedVersion: 1 })).status, 200);
      assert.equal((await write(employeeA.agent, `/orders/${orderId}/transitions`, { to: 'READY', expectedVersion: 1 })).status, 409);
      assert.equal((await write(employeeA.agent, `/orders/${orderId}/transitions`, { to: 'READY', expectedVersion: 2 })).status, 200);
      assert.equal((await write(employeeA.agent, `/orders/${orderId}/transitions`, { to: 'COMPLETED', expectedVersion: 3 })).status, 422);
    });
    await t.test('unclaimed courier offers hide personal data and foreign tenants cannot claim', async () => {
      const offers = await courierA.agent.get('/api/v1/state'); assert.equal(offers.status, 200);
      const offered = offers.body.data.orders.find((o: { id: string }) => o.id === orderId);
      assert.ok(offered); assert.notEqual(offered.customer, 'Private customer'); assert.notEqual(offered.address, 'Private address');
      assert.equal((await write(courierB.agent, `/courier/orders/${orderId}/accept`, { expectedVersion: 3 })).status, 404);
    });
    await t.test('two couriers racing for one order yield exactly one assignment', async () => {
      const responses = await Promise.all([courierA, courierA2].map(c => write(c.agent, `/courier/orders/${orderId}/accept`, { expectedVersion: 3 })));
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      assert.equal(await db.delivery.count({ where: { orderId: Number(orderId) } }), 1);
    });
    const delivery = await db.delivery.findUniqueOrThrow({ where: { orderId: Number(orderId) } });
    const assigned = delivery.courierId === courierA.user.courier!.id ? courierA : courierA2;
    const other = assigned === courierA ? courierA2 : courierA;
    await t.test('only assigned courier can pick up and deliver; delivery releases courier', async () => {
      assert.equal((await write(other.agent, `/courier/orders/${orderId}/transitions`, { to: 'DELIVERING', expectedVersion: 4 })).status, 404);
      assert.equal((await write(assigned.agent, `/courier/orders/${orderId}/transitions`, { to: 'DELIVERING', expectedVersion: 4 })).status, 200);
      assert.equal((await write(assigned.agent, `/courier/orders/${orderId}/transitions`, { to: 'COMPLETED', expectedVersion: 5 })).status, 200);
      const record = await db.delivery.findUniqueOrThrow({ where: { orderId: Number(orderId) } }); assert.equal(record.status, 'DELIVERED');
      assert.equal((await db.courier.findUniqueOrThrow({ where: { id: delivery.courierId } })).available, true);
    });
    await t.test('two orders racing for the same courier cannot double-book', async () => {
      const one = await create(); const two = await create(); assert.equal(one.status, 201); assert.equal(two.status, 201);
      const courierId = assigned.user.courier!.id;
      const responses = await Promise.all([one, two].map(o => write(employeeA.agent, `/orders/${o.body.data.id}/delivery`, { courierId, expectedVersion: 1 })));
      assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
      const accepted = responses.findIndex(r => r.status === 201); const activeId = [one, two][accepted].body.data.id;
      assert.equal((await write(assigned.agent, '/courier/me/availability', { available: true })).status, 409);
      assert.equal((await write(employeeA.agent, `/orders/${activeId}/transitions`, { to: 'CANCELLED', expectedVersion: 2 })).status, 200);
      assert.equal((await db.courier.findUniqueOrThrow({ where: { id: courierId } })).available, true);
    });
    await t.test('logout revokes session and inactive accounts lose API access', async () => {
      assert.equal((await write(employeeA.agent, '/auth/logout', {})).status, 200);
      assert.equal((await employeeA.agent.get('/api/v1/me')).status, 401);
      await db.user.update({ where: { id: employeeB.user.id }, data: { active: false } });
      assert.equal((await employeeB.agent.get('/api/v1/me')).status, 401);
    });
  } finally {
    // Delete only this test's randomly identified fixtures, never reset a database.
    await db.$transaction(async tx => {
      const where = { restaurantId: { in: tenantIds } };
      await tx.review.deleteMany({ where }); await tx.delivery.deleteMany({ where }); await tx.orderItem.deleteMany({ where });
      await tx.order.deleteMany({ where }); await tx.product.deleteMany({ where }); await tx.category.deleteMany({ where });
      await tx.courier.deleteMany({ where }); await tx.employee.deleteMany({ where });
      await tx.session.deleteMany({ where: { userId: { in: userIds } } }); await tx.user.deleteMany({ where: { id: { in: userIds } } });
      await tx.restaurant.deleteMany({ where: { id: { in: tenantIds } } });
    });
    await db.$disconnect();
  }
});
