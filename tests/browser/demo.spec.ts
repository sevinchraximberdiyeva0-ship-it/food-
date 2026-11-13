import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

test('existing demo panel and product persistence remain available explicitly', async ({ page }) => {
  let apiCalls = 0; page.on('request', req => { if (req.url().includes('/api/v1')) apiCalls++; });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Umumiy ko‘rinish' })).toBeVisible();
  await expect(page.getByText('LOKAL DEMO', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Menyu', exact: true }).click();
  await page.getByRole('button', { name: 'Taom qo‘shish', exact: true }).click();
  await page.getByLabel('Taom nomi', { exact: true }).fill('Brauzer test taomi');
  await page.getByLabel('Narxi (so‘m)', { exact: true }).fill('25000');
  await page.getByRole('button', { name: 'Menyuga qo‘shish', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Menyu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Brauzer test taomi', exact: true })).toBeVisible();
  expect(apiCalls).toBe(0);
});

test('mobile courier demo still supports courier selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/courier');
  await expect(page.getByRole('heading', { name: 'Kuryer ish maydoni' })).toBeVisible();
  await expect(page.getByLabel('Demo kuryerni tanlash')).toBeVisible();
  await page.getByLabel('Demo kuryerni tanlash').selectOption('1');
  await expect(page.getByText('Hozircha biriktirilgan buyurtma yo‘q.')).toBeVisible();
});
