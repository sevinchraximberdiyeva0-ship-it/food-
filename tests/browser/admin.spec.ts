import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

test('SUPER ADMIN can log in to an empty platform and log out without a restaurant', async ({ page }) => {
  let authenticated = false; let stateRequests = 0;
  const admin = { id: 1, name: 'Test admin', email: 'admin@example.test', role: 'ADMIN', restaurantId: null, courierId: null, isDemo: false };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/login')) { authenticated = true; return route.fulfill({ json: { data: { authenticated: true } } }); }
    if (path.endsWith('/auth/logout')) { authenticated = false; return route.fulfill({ json: { data: { authenticated: false } } }); }
    if (path.endsWith('/me')) return route.fulfill(authenticated ? { json: { data: admin } } : { status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Tizimga kiring.' } } });
    if (path.endsWith('/restaurants')) return route.fulfill({ json: { data: [] } });
    stateRequests++; return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Restoran yo‘q.' } } });
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(admin.email);
  await page.getByLabel('Parol', { exact: true }).fill(randomUUID());
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platforma boshqaruvi' })).toBeVisible();
  await expect(page.getByText('Tezkor Partner · SUPER ADMIN')).toBeVisible();
  await expect(page.getByText('Hozircha restoran yo‘q. Birinchi restoraningizni yarating.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restoran yaratish' })).toBeVisible();
  expect(stateRequests).toBe(0);
  await page.getByRole('button', { name: 'Chiqish', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Restoran paneliga kirish' })).toBeVisible();
});

test('employees and couriers do not receive the SUPER ADMIN interface', async ({ page }) => {
  for (const role of ['EMPLOYEE', 'COURIER']) {
    await page.unroute('**/api/v1/**');
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({ json: { data: path.endsWith('/me') ? { id: 2, name: 'Test account', email: 'test@example.test', role, restaurantId: 1, courierId: role === 'COURIER' ? 7 : null, isDemo: false } : { restaurantId: 1, restaurant: 'Test Restoran', phone: 'test', open: true, orders: [], menu: [], couriers: [], hours: [], promotions: [], reviews: [], employees: [] } } });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: role === 'COURIER' ? 'Kuryer ish maydoni' : 'Umumiy ko‘rinish' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Platforma boshqaruvi' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Restoran yaratish' })).toHaveCount(0);
  }
});

test('SUPER ADMIN provisions only an employee/courier and can deactivate that account', async ({ page }) => {
  const admin = { id: 1, name: 'Test admin', email: 'admin@example.test', role: 'ADMIN', restaurantId: null, courierId: null, isDemo: false };
  const snapshot = { restaurantId: 10, restaurant: 'Test Restoran', phone: 'test', open: true, orders: [], menu: [], couriers: [], hours: [], promotions: [], reviews: [], employees: [] };
  let created = false; let active = true; const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/v1/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (req.method() !== 'GET') {
      const body = req.postDataJSON(); writes.push({ path, body });
      if (path.endsWith('/employees')) created = true;
      if (path.endsWith('/accounts/2')) active = body.active;
      return route.fulfill({ json: { data: { saved: true } } });
    }
    const data = path.endsWith('/me') ? admin : path.endsWith('/restaurants') ? [{ id: 10, name: 'Test Restoran' }] : path.endsWith('/accounts') ? created ? [{ id: 2, name: 'Test employee', email: 'employee@example.test', role: 'EMPLOYEE', active }] : [] : snapshot;
    await route.fulfill({ json: { data } });
  });
  await page.goto('/');
  const form = page.locator('form').filter({ has: page.getByLabel('Hisob turi') });
  await form.getByLabel('Ism', { exact: true }).fill('Test employee');
  await form.getByLabel('Email', { exact: true }).fill('employee@example.test');
  await form.getByLabel('Boshlang‘ich parol').fill(randomUUID());
  await form.getByRole('button', { name: 'Hisob yaratish' }).click();
  await expect(page.getByText('employee@example.test · Xodim · Faol')).toBeVisible();
  await expect(form.getByLabel('Boshlang‘ich parol')).toHaveValue('');
  await page.getByRole('button', { name: 'To‘xtatish', exact: true }).click();
  await expect(page.getByText('employee@example.test · Xodim · Nofaol')).toBeVisible();
  expect(writes[0].path).toBe('/api/v1/restaurants/10/employees');
  expect(writes[0].body).not.toHaveProperty('role');
  expect(writes[1].body).toEqual({ active: false });
});
