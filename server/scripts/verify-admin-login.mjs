import { chromium } from '@playwright/test';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

// Credentials come exclusively from the local PowerShell private stdin pipe.
// Standalone browser: no traces, screenshots, videos, console/request logging,
// saved storage state, or credential artifacts are created.
let input = '';
let credentials;
let browser;
let page;
let signedIn = false;
const db = new PrismaClient({ log: [] });
try {
  if (!process.argv.includes('--verify') || process.stdin.isTTY) throw new Error('Private input required');
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input) > 8192) throw new Error('Input too large');
  }
  credentials = JSON.parse(input); input = '';
  if (typeof credentials.email !== 'string' || typeof credentials.password !== 'string') throw new Error('Invalid input');
  const origin = 'http://127.0.0.1:5173';
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Restoran paneliga kirish' }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Parol', { exact: true }).fill(credentials.password);
  const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  if ((await loginResponse).status() !== 200) throw new Error('Login rejected');
  signedIn = true;
  await page.getByRole('heading', { name: 'Platforma boshqaruvi' }).waitFor({ state: 'visible' });
  await page.getByText('Tezkor Partner · SUPER ADMIN', { exact: true }).waitFor({ state: 'visible' });
  const meResponse = await page.request.get(origin + '/api/v1/me');
  const profile = (await meResponse.json()).data;
  const receipt = await db.platformBootstrap.findUnique({ where: { key: 'first-platform-admin' }, select: { createdAdminId: true } });
  if (meResponse.status() !== 200 || profile?.role !== 'ADMIN' || profile?.isDemo !== false || receipt?.createdAdminId !== profile?.id) throw new Error('Wrong account or role');
  const verificationCookie = (await context.cookies(origin)).find(cookie => cookie.name === 'tezkor_session' || cookie.name === '__Host-tezkor_session');
  if (!verificationCookie) throw new Error('Session cookie missing');
  const verificationSessionId = createHash('sha256').update(verificationCookie.value).digest('hex');
  if ((await page.request.get(origin + '/api/v1/restaurants')).status() !== 200) throw new Error('Admin access rejected');
  const logoutResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/logout' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Chiqish', exact: true }).click();
  if ((await logoutResponse).status() !== 200) throw new Error('Logout rejected');
  signedIn = false;
  await page.getByRole('heading', { name: 'Restoran paneliga kirish' }).waitFor({ state: 'visible' });
  if ((await page.request.get(origin + '/api/v1/me')).status() !== 401) throw new Error('Session still active');
  if (await db.session.count({ where: { id: verificationSessionId } }) !== 0) throw new Error('Verification session not revoked');
  console.log(JSON.stringify({ ok: true, loginVerified: true, adminPanelVerified: true, adminAccessVerified: true, logoutVerified: true, sessionRevoked: true }));
} catch {
  // Never print Playwright errors: locator context might contain credentials.
  console.log(JSON.stringify({ ok: false, code: 'ADMIN_LOGIN_VERIFICATION_FAILED' }));
  process.exitCode = 1;
} finally {
  if (signedIn && page) await page.request.post('http://127.0.0.1:5173/api/v1/auth/logout', { headers: { 'X-Requested-With': 'TezkorPartner' }, data: {} }).catch(() => {});
  credentials = undefined; input = '';
  if (browser) await browser.close().catch(() => {});
  await db.$disconnect().catch(() => {});
}
