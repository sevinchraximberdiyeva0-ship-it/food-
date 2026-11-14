import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test.beforeEach(async ({ page }) => {
  // Only optional external fonts are blocked. All API calls hit the running API.
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

test('live frontend proxy connects to real PostgreSQL; anonymous routes are protected', async ({ page }) => {
  const health = await page.request.get('/api/v1/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ data: { status: 'ok', database: 'connected' } });
  for (const path of ['orders', 'products', 'restaurants', 'couriers', 'state']) {
    const response = await page.request.get('/api/v1/' + path);
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Restoran paneliga kirish' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('LOKAL DEMO', { exact: true })).toHaveCount(0);
});

test('live login rejects nonexistent account without creating an account or order', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`verification-${randomUUID()}@example.test`);
  await page.getByLabel('Parol', { exact: true }).fill(randomUUID());
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/login'));
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  expect((await responsePromise).status()).toBe(401);
  await expect(page.getByRole('alert')).toContainText('Email yoki parol noto‘g‘ri');
});

test('live courier route opens on mobile and requires a real session', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
  await page.goto('/courier');
  expect((await responsePromise).status()).toBe(401);
  await expect(page.getByRole('heading', { name: 'Kuryer kirishi' })).toBeVisible();
  await expect(page.getByLabel('Demo kuryerni tanlash')).toHaveCount(0);
});
