export type Page = 'dashboard' | 'orders' | 'menu' | 'hours' | 'promotions' | 'finance' | 'analytics' | 'reviews' | 'staff' | 'settings' | 'courier';
export type OrderStatus = 'Yangi' | 'Tayyorlanmoqda' | 'Yetkazilmoqda' | 'Yakunlangan' | 'Bekor qilingan';
export interface Order {
  id: string; customer: string; initials: string; items: string; total: number;
  time: string; status: OrderStatus; delivery: 'internal' | 'external';
  address: string; courierId?: number;
  serverStatus?: 'NEW' | 'PREPARING' | 'READY' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED';
  version?: number; isDemo?: boolean;
}
export interface Courier { id: number; name: string; type: 'internal' | 'external'; available: boolean; }
export interface MenuItem { id: number; name: string; category: string; price: number; emoji: string; available: boolean; }
export interface AppState {
  orders: Order[]; menu: MenuItem[]; couriers: Courier[]; open: boolean;
  restaurant: string; phone: string; hours: { day: string; start: string; end: string; enabled: boolean }[];
  promotions: { id: number; name: string; discount: number; active: boolean }[];
  restaurantId?: number; isDemo?: boolean; truncated?: boolean;
  reviews?: { name: string; text: string; score: number }[];
  employees?: { id: number; name: string; email: string; active: boolean }[];
}
