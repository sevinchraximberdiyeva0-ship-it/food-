import { z } from 'zod';

export const id = z.coerce.number().int().positive().max(2147483647);
const text = (max: number) => z.string().trim().min(1).max(max);
export const loginInput = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(200) });
export const restaurantInput = z.object({ name: text(80), phone: text(25), address: text(300), open: z.boolean().optional() });
export const restaurantPatch = restaurantInput.partial().strict();
export const productInput = z.object({ name: text(80), price: z.number().int().min(1000).max(10000000), category: text(60), emoji: text(16).optional(), available: z.boolean().optional() }).strict();
export const productPatch = productInput.partial();
export const orderInput = z.object({ restaurantId: id, customer: text(100), address: text(300), items: z.array(z.object({ productId: id, quantity: z.number().int().min(1).max(100) }).strict()).min(1).max(50) }).strict();
export const transitionInput = z.object({ to: z.enum(['NEW', 'PREPARING', 'READY', 'DELIVERING', 'COMPLETED', 'CANCELLED']), expectedVersion: id }).strict();
export const assignInput = z.object({ courierId: id, expectedVersion: id }).strict();
export const userInput = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), name: text(80), password: z.string().min(12).max(200) }).strict();
export const hoursInput = z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), enabled: z.boolean() }).strict()).length(7).refine(hours => new Set(hours.map(h => h.weekday)).size === 7, 'Hafta kunlari takrorlanmasin');
export const listQuery = z.object({ restaurantId: id.optional(), limit: z.coerce.number().int().min(1).max(100).default(25), cursor: id.optional(), status: transitionInput.shape.to.optional() });
