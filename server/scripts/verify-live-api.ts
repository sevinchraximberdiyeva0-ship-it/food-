import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma, type Role } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/security.js';

// Real PostgreSQL and real Express routes, with ALL fixture writes inside ONE
// transaction that is ALWAYS rolled back. No Order/OrderItem/Delivery is created.
// Explicit unused IDs avoid advancing PostgreSQL autoincrement sequences.
const db = new PrismaClient({ log: [] });
const rollback = new Error('INTENTIONAL_VERIFICATION_ROLLBACK');
const checks: { name: string; status: 'passed' }[] = [];
const fixtureIds: number[] = [];
const tag = randomUUID();
function ensure(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function passed(name: string) { checks.push({ name, status: 'passed' }); console.log(`PASS: ${name}`); }
async function inventory() {
  const [users, restaurants, products, orders, couriers, sessions] = await db.$transaction([
    db.user.count(), db.restaurant.count(), db.product.count(), db.order.count(), db.courier.count(), db.session.count(),
  ]);
  return { users, restaurants, products, orders, couriers, sessions };
}

try {
  const parsed = new URL(process.env.DATABASE_URL ?? '');
  ensure(parsed.hostname === '127.0.0.1' && parsed.pathname === '/tezkor_demo', 'This check is limited to the local tezkor_demo database.');
  const before = await inventory();
  passed('PostgreSQL model reads');
  try {
    await db.$transaction(async tx => {
      // Inject the outer transaction into the test app only. Production app
      // keeps its normal PrismaClient and transaction/isolation behavior.
      const transactionalDb = new Proxy(tx, {
        get(target, property) {
          if (property === '$transaction') return async (operation: ((client: Prisma.TransactionClient) => unknown) | Promise<unknown>[]) =>
            typeof operation === 'function' ? operation(tx) : Promise.all(operation);
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as unknown as PrismaClient;
      const app = createApp(transactionalDb, { origin: 'http://127.0.0.1:5173' });
      let nextId = randomInt(1_500_000_000, 1_900_000_000);
      async function unusedId(model: 'user' | 'restaurant' | 'employee' | 'courier' | 'category' | 'product') {
        const id = nextId++;
        const delegate = tx[model] as unknown as { count(args: { where: { id: number } }): Promise<number> };
        ensure(await delegate.count({ where: { id } }) === 0, 'Random verification ID collision; stop without overwriting.');
        fixtureIds.push(id);
        return id;
      }
      const restaurantId = await unusedId('restaurant'); const otherId = await unusedId('restaurant');
      for (const id of [restaurantId, otherId]) await tx.restaurant.create({ data: { id, name: 'ROLLBACK ONLY verification ' + tag, phone: 'verification', address: 'verification', isDemo: true } });
      const categoryId = await unusedId('category'); const productId = await unusedId('product');
      await tx.category.create({ data: { id: categoryId, restaurantId, name: 'ROLLBACK ONLY' } });
      await tx.product.create({ data: { id: productId, restaurantId, categoryId, name: 'ROLLBACK ONLY product', price: 42000 } });
      const secret = randomUUID() + randomUUID(); const passwordHash = await hashPassword(secret);
      async function account(role: Role, tenant: number | null, suffix: string) {
        const userId = await unusedId('user');
        await tx.user.create({ data: { id: userId, email: `${suffix}-${tag}@example.test`, name: 'ROLLBACK ONLY', passwordHash, role, isDemo: true } });
        let courierId: number | undefined;
        if (role === 'EMPLOYEE') await tx.employee.create({ data: { id: await unusedId('employee'), userId, restaurantId: tenant! } });
        if (role === 'COURIER') {
          courierId = await unusedId('courier');
          await tx.courier.create({ data: { id: courierId, userId, restaurantId: tenant! } });
        }
        const agent = request.agent(app);
        const response = await agent.post('/api/v1/auth/login').set('X-Requested-With', 'TezkorPartner').send({ email: `${suffix}-${tag}@example.test`, password: secret });
        ensure(response.status === 200, 'Fixture login failed.');
        const cookies = response.headers['set-cookie'] as unknown as string[];
        ensure(cookies.some(cookie => cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict')), 'Cookie protections missing.');
        ensure(!JSON.stringify(response.body).includes(passwordHash), 'Login must not expose password hash.');
        return { agent, userId, courierId };
      }
      const admin = await account('ADMIN', null, 'admin');
      const employee = await account('EMPLOYEE', restaurantId, 'employee');
      const otherEmployee = await account('EMPLOYEE', otherId, 'other');
      const courier = await account('COURIER', restaurantId, 'courier');
      passed('Real login, session storage, HttpOnly cookie and three roles (rollback-only accounts)');
      const get = (agent: typeof employee.agent, path: string) => agent.get('/api/v1' + path);
      const write = (agent: typeof employee.agent, path: string, body: object) => agent.post('/api/v1' + path).set('X-Requested-With', 'TezkorPartner').send(body);
      const patch = (agent: typeof employee.agent, path: string, body: object) => agent.patch('/api/v1' + path).set('X-Requested-With', 'TezkorPartner').send(body);

      for (const path of ['/orders', '/products', '/restaurants', '/couriers', '/state', `/restaurants/${restaurantId}`, `/restaurants/${restaurantId}/categories`]) {
        ensure((await get(employee.agent, path)).status === 200, 'Authenticated GET failed: ' + path);
        passed('Authenticated GET ' + path.replace(String(restaurantId), ':restaurantId'));
      }
      const productList = await get(employee.agent, '/products?limit=1');
      ensure(productList.body.data.length === 1 && productList.body.data[0].id === productId, 'Product scope/pagination failed.');
      const orderList = await get(employee.agent, '/orders');
      ensure(orderList.body.data.length === 0, 'Fixture tenant must not read real orders.');
      ensure((await get(otherEmployee.agent, `/products?restaurantId=${restaurantId}`)).status === 404, 'Tenant filter bypass.');
      ensure((await patch(otherEmployee.agent, `/products/${productId}`, { available: false })).status === 404, 'Foreign product mutation allowed.');
      ensure((await get(otherEmployee.agent, `/restaurants/${restaurantId}`)).status === 404, 'Foreign restaurant visible.');
      ensure((await get(courier.agent, '/products')).status === 403, 'Courier read of menu is forbidden.');
      ensure((await get(admin.agent, `/products?restaurantId=${restaurantId}`)).status === 200, 'Admin restaurant selection failed.');
      passed('Tenant isolation, pagination and role checks against real PostgreSQL');

      ensure((await patch(employee.agent, `/products/${productId}`, { price: 43000, available: false })).status === 200, 'Product update failed.');
      const updatedProduct = await tx.product.findUniqueOrThrow({ where: { id: productId } });
      ensure(updatedProduct.price === 43000 && !updatedProduct.available, 'Product write was not read back.');
      ensure((await patch(employee.agent, `/restaurants/${restaurantId}`, { open: false })).status === 200, 'Restaurant update failed.');
      ensure(!(await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } })).open, 'Restaurant write was not read back.');
      passed('Product and restaurant API writes read back from PostgreSQL (rollback-only fixtures)');

      const hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '09:00', end: '23:00', enabled: true }));
      // This endpoint allocates serial IDs, so validate its rejected-input path
      // only. No sequence values or real schedule rows should be changed.
      const badHours = await employee.agent.put(`/api/v1/restaurants/${restaurantId}/working-hours`).set('X-Requested-With', 'TezkorPartner').send(hours.slice(0, 1));
      ensure(badHours.status === 400, 'Working hours validation failed.');
      ensure((await write(courier.agent, '/courier/me/availability', { available: false })).status === 200, 'Courier availability update failed.');
      ensure(!(await tx.courier.findUniqueOrThrow({ where: { id: courier.courierId! } })).available, 'Courier write was not read back.');
      ensure((await get(courier.agent, '/courier/me/tasks')).status === 200, 'Courier tasks failed.');
      ensure((await get(courier.agent, '/state')).status === 200, 'Courier state failed.');
      passed('Courier tasks, scoped state and availability write/read (rollback-only fixture)');

      // No synthetic or real order is inserted: invalid data is rejected before
      // create, and status/delivery operations target only a verified unused ID.
      const missingOrderId = nextId++;
      ensure(await tx.order.count({ where: { id: missingOrderId } }) === 0, 'Missing-order fixture ID collision.');
      ensure((await write(employee.agent, '/orders', { restaurantId, customer: 'invalid', address: 'invalid', items: [] })).status === 400, 'Order validation failed.');
      ensure((await write(employee.agent, `/orders/${missingOrderId}/transitions`, { to: 'PREPARING', expectedVersion: 1 })).status === 404, 'Unknown order transition should be 404.');
      ensure((await write(employee.agent, `/orders/${missingOrderId}/delivery`, { courierId: courier.courierId, expectedVersion: 1 })).status === 404, 'Unknown order delivery should be 404.');
      ensure((await write(courier.agent, `/courier/orders/${missingOrderId}/accept`, { expectedVersion: 1 })).status === 404, 'Unknown courier accept should be 404.');
      ensure(await tx.order.count({ where: { restaurantId } }) === 0, 'This verification must never create an order.');
      passed('Order validation, missing-order transition/assignment/accept; ZERO orders created or changed');
      const accountList = await get(admin.agent, `/restaurants/${restaurantId}/accounts`);
      ensure(accountList.status === 200 && accountList.body.data.length === 2, 'Admin account list must contain only this tenant employee/courier.');
      ensure(accountList.body.data.every((row: { role: string; passwordHash?: string }) => ['EMPLOYEE', 'COURIER'].includes(row.role) && !row.passwordHash), 'Account list must not expose admin or hashes.');
      ensure((await patch(admin.agent, `/restaurants/${restaurantId}/accounts/${otherEmployee.userId}`, { active: false })).status === 404, 'Cross-tenant account deactivation must fail.');
      ensure((await patch(admin.agent, `/restaurants/${restaurantId}/accounts/${admin.userId}`, { active: false })).status === 404, 'Staff-management API must not change platform admins.');
      ensure((await patch(admin.agent, `/restaurants/${restaurantId}/accounts/${courier.userId}`, { active: false })).status === 200, 'Courier deactivation failed.');
      ensure((await get(courier.agent, '/me')).status === 401, 'Deactivation must revoke session.');
      ensure((await patch(admin.agent, `/restaurants/${restaurantId}/accounts/${courier.userId}`, { active: true })).status === 200, 'Courier reactivation failed.');
      ensure((await patch(admin.agent, `/restaurants/${restaurantId}/accounts/${courier.userId}`, { active: true, role: 'ADMIN' })).status === 400, 'Account PATCH must refuse role elevation.');
      passed('Admin account list/deactivation/reactivation, tenant guard and session revocation (rollback-only)');
      ensure((await write(employee.agent, '/auth/logout', {})).status === 200, 'Logout failed.');
      ensure((await get(employee.agent, '/me')).status === 401, 'Logout did not revoke session.');
      passed('Logout revokes real DB session inside rollback transaction');
      throw rollback;
    }, { timeout: 60_000, maxWait: 5000 });
  } catch (error) { if (error !== rollback) throw error; }
  const after = await inventory();
  for (const id of fixtureIds) {
    ensure(await db.user.count({ where: { id } }) === 0, 'Rollback fixture user remains.');
    ensure(await db.restaurant.count({ where: { id } }) === 0, 'Rollback fixture restaurant remains.');
    ensure(await db.product.count({ where: { id } }) === 0, 'Rollback fixture product remains.');
    ensure(await db.courier.count({ where: { id } }) === 0, 'Rollback fixture courier remains.');
  }
  passed('Rollback confirmed: no fixture user, restaurant, product or courier persisted');
  console.log(JSON.stringify({ ok: true, checks: checks.length, before, after, ordersCreated: 0, reset: false, seed: false, committedTestWrites: false }));
} catch (error) {
  // Keep all error messages/stack/connection strings out of terminal output.
  console.error(JSON.stringify({ ok: false, completedChecks: checks.length, errorType: error instanceof Error ? error.name : 'Unknown', code: 'SAFE_API_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
