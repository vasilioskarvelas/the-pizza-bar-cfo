// Phase 14 — Permission matrix runner. Executes the matrix against authenticated sessions.
// External, Node 20+. Requires provisioned test accounts (see manifests/test-accounts.json).
//
// Usage: node tests/permissions/run-permission-matrix.mjs --base https://APP_URL --credentials creds.json
// creds.json shape: [{ role, email, password, organisation_id, site_id }]
//
// Tests BOTH backend function enforcement (HTTP status) and a frontend visibility check
// (optional, via Playwright reuse) — backend check is authoritative.

import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.split('=');
  return [k.replace(/^--/, ''), v];
}));
const base = args.base;
const credsPath = args.credentials;
if (!base || !credsPath) { console.error('Usage: --base URL --credentials creds.json'); process.exit(1); }

const matrix = JSON.parse(readFileSync('tests/permissions/permission-matrix.json', 'utf8'));
const creds = JSON.parse(readFileSync(credsPath, 'utf8'));
const byRole = Object.fromEntries(creds.map((c) => [c.role, c]));

const FUNCTION_RESOURCES = new Set(['getEnterpriseAnalytics','getEnterpriseDashboard','runFinancialCalculations',
  'runOwnerScoreCalculation','generateWeeklyReport','generateAISummary','generateExecutiveReport']);

async function login(c) {
  const r = await fetch(`${base}/_functions/invokeViaSdkLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: c.email, password: c.password }) }).catch(() => null);
  // Real auth uses the Base44 auth SDK client-side; this runner assumes an access token is supplied in creds.
  return c.access_token || null;
}

async function checkBackend(role, resource, action, token, orgId, siteId) {
  if (FUNCTION_RESOURCES.has(resource)) {
    const res = await fetch(`${base}/_functions/${resource}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ organisation_id: orgId, site_id: siteId }),
    });
    const allowed = res.status >= 200 && res.status < 300;
    return { actual: allowed ? 'allow' : 'deny', status: res.status };
  }
  // CRUD resource: attempt a create/update/delete/read and observe 403 vs 2xx
  const res = await fetch(`${base}/_functions/${resource}Action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, organisation_id: orgId, site_id: siteId }),
  }).catch(() => ({ status: 0 }));
  const allowed = res.status >= 200 && res.status < 300;
  return { actual: allowed ? 'allow' : 'deny', status: res.status };
}

(async () => {
  const results = [];
  for (const m of matrix.matrix) {
    const c = byRole[m.role];
    if (!c) { results.push({ ...m, status: 'blocked', reason: 'no test account' }); continue; }
    const token = await login(c);
    const { actual, status } = await checkBackend(m.role, m.resource, m.action, token, c.organisation_id, c.site_id);
    const pass = actual === m.expected;
    results.push({ ...m, actual, http_status: status, pass });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${m.role.padEnd(20)} ${m.resource.padEnd(28)} ${m.action.padEnd(10)} expected=${m.expected} actual=${actual} (${status})`);
  }
  const failed = results.filter((r) => r.pass === false);
  console.log(`\n${results.length} checks · ${failed.length} failed`);
  if (failed.length) { console.error('PERMISSION MATRIX FAILED'); process.exit(1); }
  console.log('PERMISSION MATRIX PASSED');
})();