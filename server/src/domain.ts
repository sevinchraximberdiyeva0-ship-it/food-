import type { OrderStatus, Role } from '@prisma/client';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function assertTransition(role: Role, from: OrderStatus, to: OrderStatus) {
  const staff = role === 'ADMIN' || role === 'EMPLOYEE';
  const allowed = staff
    ? (from === 'NEW' && to === 'PREPARING') || (from === 'PREPARING' && to === 'READY') || (['NEW', 'PREPARING', 'READY'].includes(from) && to === 'CANCELLED')
    : (from === 'READY' && to === 'DELIVERING') || (from === 'DELIVERING' && to === 'COMPLETED');
  if (!allowed) throw new ApiError(422, 'INVALID_TRANSITION', 'Bu holatga o‘tish uchun ruxsat yo‘q.');
}
export function assertVersion(actual: number, expected: number) {
  if (actual !== expected) throw new ApiError(409, 'VERSION_CONFLICT', 'Buyurtma o‘zgargan. Ro‘yxatni yangilang.');
}
