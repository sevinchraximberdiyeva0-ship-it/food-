import type { AppState } from './types';

export const initialState: AppState = {
  restaurant: 'Osh Markazi', phone: '+998 90 123 45 67', open: true,
  orders: [
    { id: '1048', customer: 'Azizbek Karimov', initials: 'AK', items: 'Choyxona osh ×2, Achchiq-chuchuk', total: 98000, time: '14:42', status: 'Yangi', delivery: 'internal', address: 'Chilonzor, 7-mavze, 24-uy' },
    { id: '1047', customer: 'Madina Rahimova', initials: 'MR', items: 'Qozon kabob ×1, Non ×2', total: 86000, time: '14:38', status: 'Tayyorlanmoqda', delivery: 'external', address: 'Amir Temur shohko‘chasi, 15', courierId: 3 },
    { id: '1046', customer: 'Sardor Aliyev', initials: 'SA', items: 'Choyxona osh ×3, Coca-Cola', total: 156000, time: '14:31', status: 'Yetkazilmoqda', delivery: 'internal', address: 'Yunusobod, 4-mavze, 12-uy', courierId: 2 },
    { id: '1045', customer: 'Shahnoza Usmonova', initials: 'SU', items: 'Manti ×2, Ko‘k choy', total: 74000, time: '14:25', status: 'Yangi', delivery: 'external', address: 'Oybek ko‘chasi, 42' },
    { id: '1044', customer: 'Javohir Tursunov', initials: 'JT', items: 'Lag‘mon ×1, Somsa ×2', total: 68000, time: '14:18', status: 'Yakunlangan', delivery: 'internal', address: 'Bunyodkor ko‘chasi, 8' },
    { id: '1043', customer: 'Dilnoza Sobirova', initials: 'DS', items: 'Qozon kabob ×2', total: 144000, time: '14:10', status: 'Yakunlangan', delivery: 'external', address: 'Nukus ko‘chasi, 18' },
  ],
  menu: [
    { id: 1, name: 'Choyxona osh', category: 'Asosiy taomlar', price: 42000, emoji: '🍛', available: true },
    { id: 2, name: 'Qozon kabob', category: 'Asosiy taomlar', price: 72000, emoji: '🍖', available: true },
    { id: 3, name: 'Uy lag‘moni', category: 'Asosiy taomlar', price: 44000, emoji: '🍜', available: true },
    { id: 4, name: 'Tandir somsa', category: 'Pishiriqlar', price: 12000, emoji: '🥟', available: true },
    { id: 5, name: 'Achchiq-chuchuk', category: 'Salatlar', price: 14000, emoji: '🥗', available: true },
    { id: 6, name: 'Manti', category: 'Asosiy taomlar', price: 32000, emoji: '🥟', available: false },
  ],
  couriers: [
    { id: 1, name: 'Bekzod Rustamov', type: 'internal', available: true },
    { id: 2, name: 'Jasur Abduqodirov', type: 'internal', available: false },
    { id: 3, name: 'Express hamkor · Ali', type: 'external', available: false },
    { id: 4, name: 'Express hamkor · Umar', type: 'external', available: true },
  ],
  hours: ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'].map(day => ({ day, start: '09:00', end: '23:00', enabled: true })),
  promotions: [{ id: 1, name: 'Tushlik vaqti', discount: 15, active: true }, { id: 2, name: 'Birinchi buyurtma', discount: 20, active: false }],
};
