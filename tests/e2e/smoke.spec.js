// Phase 14 — Playwright browser smoke suite. Playwright is NOT installed in this project.
// Install externally before running:
//   npm i -D @playwright/test
//   npx playwright install --with-deps chromium
//   E2E_BASE_URL=http://localhost:4173 E2E_USER_EMAIL=... E2E_USER_PASSWORD=... \
//     E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
//     npx playwright test tests/e2e/smoke.spec.js --project=chromium
//
// Auth: beforeAll logs in BOTH an admin (E2E_ADMIN_*) and a standard non-admin user
// (E2E_USER_*), saving storage states to tests/e2e/.auth/{admin,user}.json. Admin-gated
// tests use the admin state; the non-admin denial test uses the standard state; the
// login-flow and unauthenticated-admin tests use fresh contexts. E2E_USER must be a
// non-admin account (e.g. site_manager / read_only) for the denial test to be valid.
// Fails on uncaught page errors and console errors; screenshots on failure.

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:4173';
const ADMIN_AUTH = 'tests/e2e/.auth/admin.json';
const USER_AUTH = 'tests/e2e/.auth/user.json';

mkdirSync('tests/e2e/.auth', { recursive: true });
mkdirSync('tests/e2e/screenshots', { recursive: true });

function attachGuards(page) {
  page.on('pageerror', (e) => { throw new Error(`uncaught page error: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error') throw new Error(`console error: ${m.text()}`); });
}

async function loginAs(ctx, email, password) {
  const page = await ctx.newPage();
  attachGuards(page);
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/$/, { timeout: 30000 });
  await page.close();
}

test.beforeAll(async ({ browser }) => {
  if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_USER_EMAIL) {
    throw new Error('E2E_ADMIN_EMAIL/PASSWORD and E2E_USER_EMAIL/PASSWORD are required');
  }
  const adminCtx = await browser.newContext();
  await loginAs(adminCtx, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
  await adminCtx.storageState({ path: ADMIN_AUTH });
  await adminCtx.close();
  const userCtx = await browser.newContext();
  await loginAs(userCtx, process.env.E2E_USER_EMAIL, process.env.E2E_USER_PASSWORD);
  await userCtx.storageState({ path: USER_AUTH });
  await userCtx.close();
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

test.describe('authenticated as admin', () => {
  test.use({ storageState: ADMIN_AUTH });
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

  test('admin pages render the admin shell (orgs, sites, roles)', async ({ page }) => {
    for (const path of ['/admin/organisations', '/admin/sites', '/admin/roles']) {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState('networkidle');
      // 'HFOS Admin' sidebar text only renders for admin roles; the non-admin denied
      // screen does not include it.
      await expect(page.locator('text=HFOS Admin')).toBeVisible();
    }
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
});

test('non-admin user is denied the admin area', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: USER_AUTH });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw new Error(`page error: ${e.message}`); });
  await page.goto(`${BASE}/admin/users`);
  // AdminLayout renders an 'Administrator access required' screen for authenticated non-admins.
  await expect(page.locator('text=Administrator access required')).toBeVisible({ timeout: 10000 });
  await ctx.close();
});

test('unauthenticated user is redirected from admin route to login', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw new Error(`page error: ${e.message}`); });
  await page.goto(`${BASE}/admin/users`);
  await page.waitForURL(/\/login/, { timeout: 10000 });
  await ctx.close();
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== 'passed') {
    try { await page.screenshot({ path: `tests/e2e/screenshots/${testInfo.title.replace(/\s+/g, '_')}.png`, fullPage: true }); }
    catch { /* page may already be closed */ }
  }
});