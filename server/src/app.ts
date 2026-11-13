import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type Role, type OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { ApiError, assertTransition, assertVersion } from './domain.js';
import { hashPassword, verifyPassword, tokenHash, sessionToken } from './security.js';
import * as v from './validation.js';

export interface Actor { id: number; name: string; email: string; role: Role; restaurantId: number | null; courierId: number | null; isDemo: boolean }
interface Options { origin: string; production?: boolean }
const days = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
const statusLabels: Record<OrderStatus, string> = { NEW: 'Yangi', PREPARING: 'Tayyorlanmoqda', READY: 'Tayyorlanmoqda', DELIVERING: 'Yetkazilmoqda', COMPLETED: 'Yakunlangan', CANCELLED: 'Bekor qilingan' };
const orderInclude = { items: true, delivery: true } satisfies Prisma.OrderInclude;
type IncludedOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
const actor = (res: Response) => res.locals.actor as Actor;
const staff = (who: Actor) => { if (who.role === 'COURIER') throw new ApiError(403, 'FORBIDDEN', 'Faqat restoran xodimi uchun.'); };
const admin = (who: Actor) => { if (who.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Faqat administrator uchun.'); };
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Ma’lumot topilmadi.');
const conflict = () => new ApiError(409, 'ASSIGNMENT_CONFLICT', 'Buyurtma yoki kuryer band. Ro‘yxatni yangilang.');
export function toOrder(order: IncludedOrder, hideCustomer = false) {
  return {
    id: String(order.id), customer: hideCustomer ? 'Qabul qilish uchun tayyor' : order.customer,
    initials: hideCustomer ? '—' : order.customer.split(' ').map(s => s[0]).slice(0, 2).join(''),
    address: hideCustomer ? 'Manzil qabul qilingandan keyin ochiladi' : order.address,
    items: order.items.map(item => `${item.name} ×${item.quantity}`).join(', '), total: order.total,
    time: order.createdAt.toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' }),
    status: statusLabels[order.status], serverStatus: order.status, version: order.version,
    delivery: 'internal', courierId: order.delivery?.courierId, isDemo: order.isDemo,
  };
}

export function createApp(db: PrismaClient, options: Options) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req, res, next) => { res.locals.requestId = randomUUID(); res.setHeader('X-Request-ID', res.locals.requestId); res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '64kb' }));
  // Same-origin deployment + custom header prevents cross-origin form/CSRF writes.
  // Deliberately no CORS middleware: third-party sites cannot call this API.
  app.use('/api/v1', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.get('X-Requested-With') !== 'TezkorPartner' || (req.get('Origin') && req.get('Origin') !== options.origin))) {
      return next(new ApiError(403, 'CSRF_REJECTED', 'So‘rov manbasi tasdiqlanmadi.'));
    }
    next();
  });
  app.use('/api/v1', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Juda ko‘p so‘rov.' } } }));
  const router = express.Router();
  app.use('/api/v1', router);
  const cookieName = options.production ? '__Host-tezkor_session' : 'tezkor_session';
  const cookieOptions = { httpOnly: true, secure: !!options.production, sameSite: 'strict' as const, path: '/' };
  function cookieToken(req: Request) {
    return req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  }
  router.get('/health', async (_req, res) => { await db.$queryRaw`SELECT 1`; res.json({ data: { status: 'ok', database: 'connected' } }); });
  // Failed logins use the same scrypt cost even for unknown email addresses.
  const dummyHash = hashPassword(randomUUID());
  router.post('/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'LOGIN_RATE_LIMITED', message: 'Keyinroq qayta urinib ko‘ring.' } } }), async (req, res) => {
    const input = v.loginInput.parse(req.body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(input.password, user?.passwordHash ?? await dummyHash);
    if (!valid || !user?.active) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email yoki parol noto‘g‘ri.');
    const token = sessionToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60_000);
    const previous = cookieToken(req);
    await db.$transaction(async tx => {
      if (previous) await tx.session.deleteMany({ where: { id: tokenHash(previous) } });
      await tx.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
      await tx.session.create({ data: { id: tokenHash(token), userId: user.id, expiresAt } });
    });
    res.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
    res.json({ data: { authenticated: true } });
  });
  router.use(async (req, res, next) => {
    const token = cookieToken(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'UNAUTHENTICATED', 'Tizimga kiring.');
    const session = await db.session.findUnique({ where: { id: tokenHash(token) }, include: { user: { include: { employee: true, courier: true } } } });
    if (!session || session.expiresAt <= new Date() || !session.user.active) throw new ApiError(401, 'UNAUTHENTICATED', 'Sessiya tugagan. Qayta kiring.');
    const user = session.user;
    res.locals.actor = { id: user.id, name: user.name, email: user.email, role: user.role, restaurantId: user.employee?.restaurantId ?? user.courier?.restaurantId ?? null, courierId: user.courier?.id ?? null, isDemo: user.isDemo } satisfies Actor;
    next();
  });
  router.get('/me', (_req, res) => res.json({ data: actor(res) }));
  router.post('/auth/logout', async (req, res) => {
    await db.session.deleteMany({ where: { id: tokenHash(cookieToken(req)!) } });
    res.clearCookie(cookieName, cookieOptions).json({ data: { authenticated: false } });
  });
  async function scope(who: Actor, requested?: unknown) {
    if (who.role === 'ADMIN') {
      if (requested !== undefined) return v.id.parse(requested);
      const first = await db.restaurant.findFirst({ orderBy: { id: 'asc' } });
      if (!first) throw notFound();
      return first.id;
    }
    if (who.restaurantId === null) throw new ApiError(403, 'NO_RESTAURANT', 'Restoranga biriktirilmagansiz.');
    if (requested !== undefined && v.id.parse(requested) !== who.restaurantId) throw notFound();
    return who.restaurantId;
  }
  function orderWhere(who: Actor, orderId: number): Prisma.OrderWhereInput {
    return { id: orderId, ...(who.role !== 'ADMIN' ? { restaurantId: who.restaurantId ?? -1 } : {}), ...(who.role === 'COURIER' ? { delivery: { courierId: who.courierId ?? -1 } } : {}) };
  }
  async function serial<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue; throw error; }
    }
  }

  router.get('/restaurants', async (_req, res) => {
    const who = actor(res);
    res.json({ data: await db.restaurant.findMany({ where: who.role === 'ADMIN' ? {} : { id: who.restaurantId ?? -1 }, orderBy: { id: 'asc' }, take: 100 }) });
  });
  router.post('/restaurants', async (req, res) => {
    admin(actor(res)); const input = v.restaurantInput.parse(req.body);
    res.status(201).json({ data: await db.restaurant.create({ data: { ...input, workingHours: { create: days.map((_day, weekday) => ({ weekday, start: '09:00', end: '23:00', enabled: true })) } } }) });
  });
  router.get('/restaurants/:id', async (req, res) => {
    const restaurant = await db.restaurant.findUnique({ where: { id: await scope(actor(res), req.params.id) } });
    if (!restaurant) throw notFound();
    res.json({ data: restaurant });
  });
  router.patch('/restaurants/:id', async (req, res) => {
    staff(actor(res)); const restaurantId = await scope(actor(res), req.params.id);
    res.json({ data: await db.restaurant.update({ where: { id: restaurantId }, data: v.restaurantPatch.parse(req.body) }) });
  });
  router.get('/restaurants/:id/categories', async (req, res) => { staff(actor(res)); res.json({ data: await db.category.findMany({ where: { restaurantId: await scope(actor(res), req.params.id) }, orderBy: { id: 'asc' } }) }); });
  router.put('/restaurants/:id/working-hours', async (req, res) => {
    staff(actor(res)); const restaurantId = await scope(actor(res), req.params.id); const hours = v.hoursInput.parse(req.body);
    await db.$transaction(hours.map(({ weekday, ...data }) => db.workingHours.upsert({ where: { restaurantId_weekday: { restaurantId, weekday } }, update: data, create: { restaurantId, weekday, ...data } })));
    res.json({ data: { saved: true } });
  });
  router.patch('/restaurants/:id/promotions/:promotionId', async (req, res) => {
    staff(actor(res)); const restaurantId = await scope(actor(res), req.params.id); const data = z.object({ active: z.boolean() }).strict().parse(req.body);
    const result = await db.promotion.updateMany({ where: { id: v.id.parse(req.params.promotionId), restaurantId }, data });
    if (!result.count) throw notFound(); res.json({ data: { saved: true } });
  });
  router.get('/products', async (req, res) => {
    staff(actor(res)); const query = v.listQuery.parse(req.query); const restaurantId = await scope(actor(res), query.restaurantId);
    const rows = await db.product.findMany({ where: { restaurantId, ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, include: { category: true }, orderBy: { id: 'asc' }, take: query.limit + 1 });
    const more = rows.length > query.limit; const data = rows.slice(0, query.limit);
    res.json({ data, page: { nextCursor: more ? data.at(-1)?.id : null } });
  });
  router.post('/products', async (req, res) => {
    staff(actor(res)); const restaurantId = await scope(actor(res), req.query.restaurantId); const { category, ...data } = v.productInput.parse(req.body);
    const result = await db.$transaction(async tx => {
      const group = await tx.category.upsert({ where: { restaurantId_name: { restaurantId, name: category } }, update: {}, create: { restaurantId, name: category } });
      return tx.product.create({ data: { ...data, restaurantId, categoryId: group.id } });
    });
    res.status(201).json({ data: result });
  });
  router.patch('/products/:id', async (req, res) => {
    staff(actor(res)); const restaurantId = await scope(actor(res), req.query.restaurantId); const productId = v.id.parse(req.params.id); const { category, ...data } = v.productPatch.parse(req.body);
    await db.$transaction(async tx => {
      const existing = await tx.product.findFirst({ where: { id: productId, restaurantId } }); if (!existing) throw notFound();
      const group = category ? await tx.category.upsert({ where: { restaurantId_name: { restaurantId, name: category } }, update: {}, create: { restaurantId, name: category } }) : null;
      await tx.product.update({ where: { id: productId }, data: { ...data, ...(group ? { categoryId: group.id } : {}) } });
    });
    res.json({ data: { saved: true } });
  });

  router.get('/orders', async (req, res) => {
    const who = actor(res); const query = v.listQuery.parse(req.query); const restaurantId = await scope(who, query.restaurantId);
    const rows = await db.order.findMany({ where: { restaurantId, ...(query.status ? { status: query.status } : {}), ...(query.cursor ? { id: { lt: query.cursor } } : {}), ...(who.role === 'COURIER' ? { delivery: { courierId: who.courierId ?? -1 } } : {}) }, include: orderInclude, orderBy: { id: 'desc' }, take: query.limit + 1 });
    const more = rows.length > query.limit; const data = rows.slice(0, query.limit);
    res.json({ data: data.map(row => toOrder(row)), page: { nextCursor: more ? data.at(-1)?.id : null } });
  });
  router.get('/orders/:id', async (req, res) => {
    const row = await db.order.findFirst({ where: orderWhere(actor(res), v.id.parse(req.params.id)), include: orderInclude });
    if (!row) throw notFound(); res.json({ data: toOrder(row) });
  });
  router.post('/orders', async (req, res) => {
    const who = actor(res); staff(who); const input = v.orderInput.parse(req.body); const restaurantId = await scope(who, input.restaurantId);
    const result = await serial(async tx => {
      const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant) throw notFound();
      if (!restaurant.open) throw new ApiError(422, 'RESTAURANT_CLOSED', 'Restoran yopiq.');
      const items = [];
      let total = 0;
      for (const entry of input.items) {
        const product = await tx.product.findFirst({ where: { id: entry.productId, restaurantId, available: true } });
        if (!product) throw new ApiError(422, 'PRODUCT_UNAVAILABLE', 'Taom mavjud emas yoki boshqa restoranga tegishli.');
        total += product.price * entry.quantity;
        items.push({ productId: product.id, name: product.name, price: product.price, quantity: entry.quantity });
      }
      if (total > 2147483647) throw new ApiError(422, 'TOTAL_TOO_LARGE', 'Buyurtma summasi chegaradan oshdi.');
      return tx.order.create({ data: { restaurantId, customer: input.customer, address: input.address, total, isDemo: restaurant.isDemo, items: { create: items } }, include: orderInclude });
    });
    res.status(201).json({ data: toOrder(result) });
  });
  async function transition(who: Actor, orderId: number, input: z.infer<typeof v.transitionInput>) {
    return serial(async tx => {
      const order = await tx.order.findFirst({ where: orderWhere(who, orderId), include: orderInclude });
      if (!order) throw notFound(); assertVersion(order.version, input.expectedVersion); assertTransition(who.role, order.status, input.to);
      const changed = await tx.order.updateMany({ where: { id: order.id, version: input.expectedVersion }, data: { status: input.to, version: { increment: 1 } } });
      if (!changed.count) throw new ApiError(409, 'VERSION_CONFLICT', 'Buyurtma o‘zgargan.');
      if (order.delivery) {
        if (input.to === 'DELIVERING') await tx.delivery.update({ where: { orderId }, data: { status: 'PICKED_UP' } });
        if (input.to === 'COMPLETED' || input.to === 'CANCELLED') {
          await tx.delivery.update({ where: { orderId }, data: { status: input.to === 'COMPLETED' ? 'DELIVERED' : 'CANCELLED' } });
          await tx.courier.update({ where: { id: order.delivery.courierId }, data: { available: true } });
        }
      }
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }
  router.post('/orders/:id/transitions', async (req, res) => {
    staff(actor(res)); res.json({ data: toOrder(await transition(actor(res), v.id.parse(req.params.id), v.transitionInput.parse(req.body))) });
  });
  async function assign(who: Actor, orderId: number, courierId: number, expectedVersion: number, selfClaim = false) {
    return serial(async tx => {
      const order = await tx.order.findFirst({ where: { id: orderId, ...(who.role === 'ADMIN' ? {} : { restaurantId: who.restaurantId ?? -1 }) }, include: orderInclude });
      if (!order) throw notFound(); assertVersion(order.version, expectedVersion);
      if (order.delivery || !['NEW', 'PREPARING', 'READY'].includes(order.status) || (selfClaim && order.status !== 'READY')) throw conflict();
      const courier = await tx.courier.findFirst({ where: { id: courierId, restaurantId: order.restaurantId, available: true, user: { active: true } } });
      if (!courier) throw conflict();
      const acquired = await tx.courier.updateMany({ where: { id: courier.id, available: true }, data: { available: false } });
      if (!acquired.count) throw conflict();
      const changed = await tx.order.updateMany({ where: { id: orderId, version: expectedVersion }, data: { version: { increment: 1 } } });
      if (!changed.count) throw conflict();
      await tx.delivery.create({ data: { restaurantId: order.restaurantId, orderId, courierId } });
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }
  router.post('/orders/:id/delivery', async (req, res) => {
    const who = actor(res); staff(who); const input = v.assignInput.parse(req.body);
    res.status(201).json({ data: toOrder(await assign(who, v.id.parse(req.params.id), input.courierId, input.expectedVersion)) });
  });
  router.get('/couriers', async (req, res) => {
    staff(actor(res)); const restaurantId = await scope(actor(res), req.query.restaurantId);
    const rows = await db.courier.findMany({ where: { restaurantId }, include: { user: { select: { name: true, active: true } } }, take: 100 });
    res.json({ data: rows.map(c => ({ id: c.id, name: c.user.name, available: c.available && c.user.active, type: 'internal' })) });
  });
  // Accounts are provisioned only by a platform admin; employees cannot grant roles.
  for (const kind of ['employees', 'couriers'] as const) {
    router.post(`/restaurants/:id/${kind}`, async (req, res) => {
      admin(actor(res)); const restaurantId = v.id.parse(req.params.id); const { password, ...input } = v.userInput.parse(req.body);
      const passwordHash = await hashPassword(password);
      const restaurant = await db.restaurant.findUnique({ where: { id: restaurantId } }); if (!restaurant) throw notFound();
      const user = await db.user.create({ data: { ...input, passwordHash, isDemo: restaurant.isDemo, role: kind === 'couriers' ? 'COURIER' : 'EMPLOYEE', ...(kind === 'couriers' ? { courier: { create: { restaurantId } } } : { employee: { create: { restaurantId } } }) }, select: { id: true, email: true, name: true, role: true } });
      res.status(201).json({ data: user });
    });
  }
  router.use('/courier', (_req, res, next) => { if (actor(res).role !== 'COURIER' || !actor(res).courierId) throw new ApiError(403, 'FORBIDDEN', 'Kuryer hisobi bilan kiring.'); next(); });
  router.get('/courier/me/tasks', async (_req, res) => {
    const who = actor(res);
    const orders = await db.order.findMany({ where: { restaurantId: who.restaurantId!, delivery: { courierId: who.courierId! }, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, include: orderInclude, orderBy: { id: 'desc' } });
    res.json({ data: orders.map(row => toOrder(row)) });
  });
  router.post('/courier/orders/:id/accept', async (req, res) => {
    const input = z.object({ expectedVersion: v.id }).strict().parse(req.body); const who = actor(res);
    res.json({ data: toOrder(await assign(who, v.id.parse(req.params.id), who.courierId!, input.expectedVersion, true)) });
  });
  router.post('/courier/orders/:id/transitions', async (req, res) => {
    res.json({ data: toOrder(await transition(actor(res), v.id.parse(req.params.id), v.transitionInput.parse(req.body))) });
  });
  router.post('/courier/me/availability', async (req, res) => {
    const data = z.object({ available: z.boolean() }).strict().parse(req.body); const who = actor(res);
    await serial(async tx => {
      const active = await tx.delivery.count({ where: { courierId: who.courierId!, status: { in: ['ASSIGNED', 'PICKED_UP'] } } });
      if (active) throw new ApiError(409, 'ACTIVE_DELIVERY', 'Avval joriy yetkazib berishni tugating.');
      await tx.courier.update({ where: { id: who.courierId! }, data });
    });
    res.json({ data });
  });

  router.get('/state', async (req, res) => {
    const who = actor(res); const restaurantId = await scope(who, req.query.restaurantId);
    const snapshot = await db.$transaction(async tx => {
      const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId } }); if (!restaurant) throw notFound();
      const courierMode = who.role === 'COURIER';
      const orders = await tx.order.findMany({ where: { restaurantId, ...(courierMode ? { OR: [{ delivery: { courierId: who.courierId! }, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, { status: 'READY', delivery: null }] } : {}) }, include: orderInclude, orderBy: { id: 'desc' }, take: 500 });
      const products = courierMode ? [] : await tx.product.findMany({ where: { restaurantId }, include: { category: true }, orderBy: { id: 'asc' } });
      const couriers = await tx.courier.findMany({ where: { restaurantId, ...(courierMode ? { id: who.courierId! } : {}) }, include: { user: { select: { name: true, active: true } } } });
      const hours = courierMode ? [] : await tx.workingHours.findMany({ where: { restaurantId }, orderBy: { weekday: 'asc' } });
      const promotions = courierMode ? [] : await tx.promotion.findMany({ where: { restaurantId } });
      const reviews = courierMode ? [] : await tx.review.findMany({ where: { restaurantId }, include: { order: { select: { customer: true } } }, take: 100 });
      const employees = courierMode ? [] : await tx.employee.findMany({ where: { restaurantId }, include: { user: { select: { name: true, email: true, active: true } } } });
      return {
        restaurantId, restaurant: restaurant.name, phone: restaurant.phone, open: restaurant.open, isDemo: restaurant.isDemo,
        orders: orders.map(row => toOrder(row, courierMode && !row.delivery)),
        menu: products.map(p => ({ id: p.id, name: p.name, price: p.price, emoji: p.emoji, available: p.available, category: p.category.name })),
        couriers: couriers.map(c => ({ id: c.id, name: c.user.name, available: c.available && c.user.active, type: 'internal' })),
        hours: hours.map(h => ({ day: days[h.weekday], start: h.start, end: h.end, enabled: h.enabled })), promotions,
        reviews: reviews.map(r => ({ name: r.order.customer, text: r.text, score: r.rating })),
        employees: employees.map(e => ({ id: e.id, ...e.user })),
        truncated: orders.length === 500,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    res.json({ data: snapshot });
  });
  app.use((_req, _res, next) => next(notFound()));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let status = 500, code = 'INTERNAL_ERROR', message = 'Server xatosi. Keyinroq qayta urinib ko‘ring.';
    let fields: unknown;
    if (error instanceof ApiError) { status = error.status; code = error.code; message = error.message; }
    else if (error instanceof z.ZodError) { status = 400; code = 'VALIDATION_ERROR'; message = 'Kiritilgan ma’lumotlar noto‘g‘ri.'; fields = error.flatten(); }
    else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P2002', 'P2034'].includes(error.code)) { status = 409; code = 'CONFLICT'; message = 'Ma’lumot allaqachon mavjud yoki parallel o‘zgargan.'; }
      if (error.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Ma’lumot topilmadi.'; }
      if (error.code === 'P2003') { status = 422; code = 'INVALID_REFERENCE'; message = 'Bog‘langan ma’lumot mavjud emas.'; }
    } else if (error instanceof Prisma.PrismaClientInitializationError) { status = 503; code = 'DATABASE_UNAVAILABLE'; message = 'PostgreSQL bilan aloqa yo‘q. Server va bazani tekshiring.'; }
    else if (error instanceof SyntaxError) { status = 400; code = 'INVALID_JSON'; message = 'JSON formati noto‘g‘ri.'; }
    else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'So‘rov hajmi juda katta.'; }
    if (status >= 500) console.error(JSON.stringify({ requestId: res.locals.requestId, code, errorType: error instanceof Error ? error.name : 'Unknown' }));
    res.status(status).json({ error: { code, message, requestId: res.locals.requestId, ...(fields ? { fields } : {}) } });
  });
  return app;
}
