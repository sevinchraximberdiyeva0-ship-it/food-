import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceOrder, assignCourier } from '../src/domain/orders.mjs';

test('a new order advances without mutating its original state', () => {
  const order = { id: '1', status: 'Yangi' };
  assert.equal(advanceOrder(order).status, 'Tayyorlanmoqda');
  assert.equal(order.status, 'Yangi');
});
test('dispatch requires an assigned courier', () => {
  assert.throws(() => advanceOrder({ status: 'Tayyorlanmoqda' }), /kuryerni/);
  assert.equal(advanceOrder({ status: 'Tayyorlanmoqda', courierId: 1 }).status, 'Yetkazilmoqda');
});
test('both internal and external couriers can be assigned', () => {
  for (const type of ['internal', 'external']) {
    const result = assignCourier({ status: 'Yangi' }, { id: 8, type, available: true });
    assert.equal(result.courierId, 8);
    assert.equal(result.delivery, type);
  }
});
test('busy couriers, double assignment and closed orders are rejected', () => {
  assert.throws(() => assignCourier({ status: 'Yangi' }, { available: false }), /band/);
  assert.throws(() => assignCourier({ status: 'Yangi', courierId: 2 }, { available: true }), /allaqachon/);
  assert.throws(() => assignCourier({ status: 'Yakunlangan' }, { available: true }), /bo‘lmaydi/);
});
test('completed orders remain terminal', () => {
  const order = { status: 'Yakunlangan', courierId: 2 };
  assert.equal(advanceOrder(order), order);
});
