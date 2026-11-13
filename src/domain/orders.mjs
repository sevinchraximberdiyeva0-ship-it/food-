export const statuses = ['Yangi', 'Tayyorlanmoqda', 'Yetkazilmoqda', 'Yakunlangan'];

export function advanceOrder(order) {
  const index = statuses.indexOf(order.status);
  if (index < 0 || index === statuses.length - 1) return order;
  if (order.status === 'Tayyorlanmoqda' && !order.courierId) {
    throw new Error('Avval kuryerni biriktiring.');
  }
  return { ...order, status: statuses[index + 1] };
}

export function assignCourier(order, courier) {
  if (!courier.available) throw new Error('Bu kuryer hozir band.');
  if (order.courierId) throw new Error('Buyurtmaga kuryer allaqachon biriktirilgan.');
  if (['Yakunlangan', 'Bekor qilingan'].includes(order.status)) throw new Error('Bu buyurtmaga kuryer biriktirib bo‘lmaydi.');
  return { ...order, courierId: courier.id, delivery: courier.type };
}
