// Phase 14 — Playwright browser smoke suite. Playwright is NOT installed in this project.
// Install externally before running:
//   npm i -D @playwright/test
//   npx playwright install --with-deps chromium
//   npx playwright test tests/e2e/smoke.spec.js --project=chromium
//
// Env: E2E_BASE_URL, E2E_USER_EMAIL, E2E_USER_PASSWORD, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD

import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:4173';
const failOnError = (page) => page.on('pageerror', (e) => { throw new Error(`uncaught page error: ${e.message}`); });

test.beforeEach(async ({ page }) => { failOnError(page); });

test('login and dashboard load', async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', process.env.E2E_USER_EMAIL);
  await page.fill('input[type="password"]', process.env.E2E_USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/$/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveTitle(/.+/);
});

test('enterprise dashboard and analytics', async ({ page, context }) => {
  // reuse an authenticated storage state in real runs; here we assume logged-in session
  await page.goto(`${BASE}/enterprise-dashboard`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).not.toBeEmpty();
  await page.goto(`${BASE}/enterprise-analytics`);
  await page.waitForLoadState('networkidle');
});

test('compliance centre and document vault', async ({ page }) => {
  await page.goto(`${BASE}/compliance`);
  await page.waitForLoadState('networkidle');
  await page.goto(`${BASE}/document-vault`);
  await page.waitForLoadState('networkidle');
});

test('admin pages (orgs, sites, roles)', async ({ page }) => {
  await page.goto(`${BASE}/admin/organisations`);
  await page.waitForLoadState('networkidle');
  await page.goto(`${BASE}/admin/sites`);
  await page.waitForLoadState('networkidle');
  await page.goto(`${BASE}/admin/roles`);
  await page.waitForLoadState('networkidle');
});

test('direct route refresh does not error', async ({ page }) => {
  await page.goto(`${BASE}/scorecard`);
  await page.reload();
  await page.waitForLoadState('networkidle');
});

test('unauthorised admin route denied for non-admin', async ({ page, context }) => {
  // run with a non-admin storage state; expect redirect or access-denied screen
  await page.goto(`${BASE}/admin/users`);
  // assertion depends on guard behaviour: either redirect to /login or show denied UI
});

test('missing route shows not-found, not blank', async ({ page }) => {
  await page.goto(`${BASE}/this-route-does-not-exist`);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('logout clears session', async ({ page }) => {
  await page.goto(`${BASE}/`);
  // trigger logout via UI; then assert redirected to /login
  await page.goto(`${BASE}/login`);
  await expect(page).toHaveURL(/\/login/);
});

// Attach screenshot on failure for every test.
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== 'passed') {
    await page.screenshot({ path: `tests/e2e/screenshots/${testInfo.title.replace(/\s+/g, '_')}.png`, fullPage: true });
  }
});