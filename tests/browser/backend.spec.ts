import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const empty = { restaurantId: 1, restaurant: 'Test Restoran', phone: '+998900000000', open: true, isDemo: false, orders: [], menu: [], couriers: [], hours: [], promotions: [], reviews: [], employees: [] };
const employee = { id: 1, email: 'test@example.test', name: 'Test Xodim', role: 'EMPLOYEE', restaurantId: 1, courierId: null, isDemo: false };

test.beforeEach(async ({ page }) => {
  // Google Fonts is optional; external network latency must not gate local tests.
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

test('login uses the API and shows the existing restaurant panel after authentication', async ({ page }) => {
  let authenticated = false;
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/login')) { authenticated = true; await route.fulfill({ json: { data: { authenticated: true } } }); }
    else if (path.endsWith('/me')) await route.fulfill(authenticated ? { json: { data: employee } } : { status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Tizimga kiring.' } } });
    else await route.fulfill({ json: { data: empty } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Restoran paneliga kirish' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(employee.email);
  await page.getByLabel('Parol', { exact: true }).fill(randomUUID());
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Umumiy ko‘rinish' })).toBeVisible();
  await expect(page.getByText('BACKEND', { exact: true })).toBeVisible();
  await expect(page.getByText('Test Restoran', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Osh Markazi', { exact: true })).toHaveCount(0);
});

test('backend failure is visible and never replaced with local demo orders', async ({ page }) => {
  await page.route('**/api/v1/**', route => route.abort());
  await page.goto('/courier');
  await expect(page.getByRole('heading', { name: 'Kuryer kirishi' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Backend bilan aloqa yo‘q');
  await expect(page.getByText('Azizbek Karimov')).toHaveCount(0);
});

test('courier accepts, picks up and completes through authenticated API calls', async ({ page }) => {
  const courier = { ...employee, role: 'COURIER', courierId: 7 };
  const order = { id: '12', customer: 'Qabul qilish uchun tayyor', initials: '—', address: 'Yashirilgan', items: 'Osh ×1', total: 42000, time: '12:00', status: 'Tayyorlanmoqda', serverStatus: 'READY', version: 1, delivery: 'internal', courierId: undefined as number | undefined };
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/v1/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path.endsWith('/me')) return route.fulfill({ json: { data: courier } });
    if (req.method() === 'POST') {
      const body = req.postDataJSON(); writes.push({ path, body });
      if (path.endsWith('/accept')) { expect(body).toEqual({ expectedVersion: 1 }); order.courierId = 7; order.customer = 'Test Mijoz'; order.address = 'Test Manzil'; }
      else { order.serverStatus = body.to; order.status = body.to === 'DELIVERING' ? 'Yetkazilmoqda' : 'Yakunlangan'; }
      order.version++;
    }
    await route.fulfill({ json: { data: path.endsWith('/state') ? { ...empty, orders: [order], couriers: [{ id: 7, name: 'Test Kuryer', available: !order.courierId, type: 'internal' }] } : order } });
  });
  await page.goto('/courier');
  await expect(page.getByRole('heading', { name: 'Kuryer ish maydoni' })).toBeVisible();
  await expect(page.getByLabel('Demo kuryerni tanlash')).toHaveCount(0);
  await page.getByRole('button', { name: 'Qabul qilish', exact: true }).click();
  await expect(page.getByText('Test Manzil', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Buyurtmani olib ketdim', exact: true }).click();
  await page.getByRole('button', { name: 'Yetkazib berdim', exact: true }).click();
  await expect(page.getByText('Hozircha biriktirilgan buyurtma yo‘q.')).toBeVisible();
  expect(writes.map(w => w.body)).toEqual([{ expectedVersion: 1 }, { to: 'DELIVERING', expectedVersion: 2 }, { to: 'COMPLETED', expectedVersion: 3 }]);
});

test('mutation failures leave product availability unchanged and show an error', async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    if (route.request().method() === 'PATCH') return route.fulfill({ status: 503, json: { error: { code: 'DATABASE_UNAVAILABLE', message: 'PostgreSQL bilan aloqa yo‘q.' } } });
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: { data: path.endsWith('/me') ? employee : { ...empty, menu: [{ id: 1, name: 'Test Osh', price: 42000, category: 'Taomlar', emoji: '🍛', available: true }] } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Menyu', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Test Osh mavjudligi' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true'); await toggle.click();
  await expect(page.getByRole('alert')).toContainText('PostgreSQL bilan aloqa yo‘q');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});
