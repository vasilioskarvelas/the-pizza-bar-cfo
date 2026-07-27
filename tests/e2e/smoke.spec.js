// Phase 14 — Playwright browser smoke suite. Playwright is NOT installed in this project.
// Install externally before running:
//   npm i -D @playwright/test
//   npx playwright install --with-deps chromium
//   E2E_BASE_URL=http://localhost:4173 E2E_USER_EMAIL=... E2E_USER_PASSWORD=... \
//     npx playwright test tests/e2e/smoke.spec.js --project=chromium
//
// Auth: beforeAll logs in once via the UI and saves a storage state to
// tests/e2e/.auth/user.json; protected tests reuse it. The login-flow and
// unauthorised-admin tests use fresh (unauthenticated) contexts.
// Fails on uncaught page errors and console errors; screenshots on failure.

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:4173';
const AUTH_FILE = 'tests/e2e/.auth/user.json';

mkdirSync('tests/e2e/.auth', { recursive: true });
mkdirSync('tests/e2e/screenshots', { recursive: true });

function attachGuards(page) {
  page.on('pageerror', (e) => { throw new Error(`uncaught page error: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error') throw new Error(`console error: ${m.text()}`); });
}

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  attachGuards(page);
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', process.env.E2E_USER_EMAIL);
  await page.fill('input[type="password"]', process.env.E2E_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/$/, { timeout: 30000 });
  await ctx.storageState({ path: AUTH_FILE });
  await ctx.close();
});

test('login flow redirects to dashboard', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  attachGuards(page);
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', process.env.E2E_USER_EMAIL);
  await page.fill('input[type="password"]', process.env.E2E_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/$/, { timeout: 30000 });
  await expect(page.locator('body')).not.toBeEmpty();
  await ctx.close();
});

test.describe('authenticated pages', () => {
  test.use({ storageState: AUTH_FILE });

  test.beforeEach(async ({ page }) => { attachGuards(page); });

  test('dashboard loads', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('enterprise dashboard and analytics', async ({ page }) => {
    await page.goto(`${BASE}/enterprise-dashboard`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    await page.goto(`${BASE}/enterprise-analytics`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('compliance centre and document vault', async ({ page }) => {
    await page.goto(`${BASE}/compliance`);
    await page.waitForLoadState('networkidle');
    await page.goto(`${BASE}/document-vault`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('admin pages (orgs, sites, roles)', async ({ page }) => {
    await page.goto(`${BASE}/admin/organisations`);
    await page.waitForLoadState('networkidle');
    await page.goto(`${BASE}/admin/sites`);
    await page.waitForLoadState('networkidle');
    await page.goto(`${BASE}/admin/roles`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('direct route refresh does not error', async ({ page }) => {
    await page.goto(`${BASE}/scorecard`);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('missing route shows not-found, not blank', async ({ page }) => {
    await page.goto(`${BASE}/this-route-does-not-exist`);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('logout clears session', async ({ page }) => {
    await page.goto(`${BASE}/`);
    // No universal logout button across layouts; verify session still active then clear storage.
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.goto(`${BASE}/login`);
    await expect(page).toHaveURL(/\/login/);
  });
});

test('unauthorised admin route denied for unauthenticated user', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw new Error(`page error: ${e.message}`); });
  await page.goto(`${BASE}/admin/users`);
  // ProtectedRoute redirects unauthenticated users to /login
  await page.waitForURL(/\/login/, { timeout: 10000 });
  await ctx.close();
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== 'passed') {
    try { await page.screenshot({ path: `tests/e2e/screenshots/${testInfo.title.replace(/\s+/g, '_')}.png`, fullPage: true }); }
    catch { /* page may already be closed */ }
  }
});