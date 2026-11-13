import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../src/security.js';

const input = z.object({
  DATABASE_URL: z.url(), ALLOW_DEMO_SEED: z.literal('true'),
  DEMO_PASSWORD: z.string().min(12).max(200),
  DEMO_ADMIN_EMAIL: z.email(), DEMO_EMPLOYEE_EMAIL: z.email(), DEMO_COURIER_EMAIL: z.email(), DEMO_SECOND_EMAIL: z.email(),
}).parse(process.env);
const databaseName = new URL(input.DATABASE_URL).pathname.slice(1);
if (process.env.NODE_ENV === 'production' || !databaseName.endsWith('_demo')) throw new Error('Seed faqat *_demo nomli alohida bazada ishlaydi.');
if (new Set([input.DEMO_ADMIN_EMAIL, input.DEMO_EMPLOYEE_EMAIL, input.DEMO_COURIER_EMAIL, input.DEMO_SECOND_EMAIL].map(e => e.toLowerCase())).size !== 4) throw new Error('Demo email manzillari har xil bo‘lsin.');
const db = new PrismaClient();
try {
  const passwordHash = await hashPassword(input.DEMO_PASSWORD);
  await db.$transaction(async tx => {
    if (await tx.restaurant.findUnique({ where: { demoKey: 'phase2-a' } })) {
      console.log('Demo seed avval yaratilgan. Mavjud ma’lumot va parollar o‘zgartirilmadi.'); return;
    }
    await tx.user.create({ data: { email: input.DEMO_ADMIN_EMAIL.toLowerCase(), name: 'Demo Platform Admin', role: 'ADMIN', passwordHash, isDemo: true } });
    for (const [index, name] of ['Osh Markazi · DEMO', 'Ikkinchi restoran · DEMO'].entries()) {
      const restaurant = await tx.restaurant.create({ data: { name, demoKey: index === 0 ? 'phase2-a' : 'phase2-b', phone: '+998 90 000 00 00', address: 'Toshkent · demo manzil', isDemo: true } });
      const restaurantId = restaurant.id;
      await tx.user.create({ data: { email: (index === 0 ? input.DEMO_EMPLOYEE_EMAIL : input.DEMO_SECOND_EMAIL).toLowerCase(), name: index === 0 ? 'Demo Restoran Xodimi' : 'Demo Ikkinchi Xodim', role: 'EMPLOYEE', passwordHash, isDemo: true, employee: { create: { restaurantId } } } });
      const courier = index === 0 ? await tx.courier.create({ data: { restaurant: { connect: { id: restaurantId } }, user: { create: { email: input.DEMO_COURIER_EMAIL.toLowerCase(), name: 'Demo Bekzod Kuryer', role: 'COURIER', passwordHash, isDemo: true } } } }) : null;
      const category = await tx.category.create({ data: { restaurantId, name: 'Asosiy taomlar' } });
      const products = [];
      for (const item of [{ name: 'Choyxona osh', price: 42000, emoji: '🍛' }, { name: 'Qozon kabob', price: 72000, emoji: '🍖' }, { name: 'Uy lag‘moni', price: 44000, emoji: '🍜' }]) {
        products.push(await tx.product.create({ data: { restaurantId, categoryId: category.id, ...item } }));
      }
      for (const [i, status] of (['NEW', 'PREPARING', 'READY'] as const).entries()) {
        const product = products[i];
        await tx.order.create({ data: { restaurantId, customer: `Demo mijoz ${index + 1}-${i + 1}`, address: 'Demo manzil · haqiqiy buyurtma emas', total: product.price * 2, status, isDemo: true, items: { create: { productId: product.id, name: product.name, price: product.price, quantity: 2 } } } });
      }
      if (courier) {
        const product = products[0];
        await tx.order.create({ data: { restaurantId, customer: 'Demo yakunlangan mijoz', address: 'Demo manzil', total: product.price, status: 'COMPLETED', isDemo: true, items: { create: { productId: product.id, name: product.name, price: product.price, quantity: 1 } }, delivery: { create: { courierId: courier.id, status: 'DELIVERED' } }, review: { create: { rating: 5, text: 'Demo sharh: taom yaxshi yetkazildi.' } } } });
      }
      await tx.workingHours.createMany({ data: Array.from({ length: 7 }, (_, weekday) => ({ restaurantId, weekday, start: '09:00', end: '23:00', enabled: true })) });
      await tx.promotion.createMany({ data: [{ restaurantId, name: 'Demo tushlik', discount: 15, active: true }, { restaurantId, name: 'Demo birinchi buyurtma', discount: 20, active: false }] });
    }
  }, { timeout: 30_000 });
  console.log('Demo bazasi tayyor. Barcha yozuvlar demo sifatida belgilangan.');
} finally { await db.$disconnect(); }
