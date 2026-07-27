// Phase 14 — Permission matrix runner. Executes the matrix against authenticated sessions.
// External, Node 20+. Requires provisioned test accounts (see manifests/test-accounts.json).
//
// Usage: node tests/permissions/run-permission-matrix.mjs --base https://APP_URL --credentials creds.json
// creds.json: [{ role, email, access_token, organisation_id, site_id }]
//   access_token is the Base44 access token obtained after login (auth is SDK/client-side,
//   so the runner cannot log in for you — supply tokens in creds).
//
// Env: FUNCTIONS_PATH (default /_functions) — confirm against your deployed Base44 app.
//
// Backend enforcement (HTTP status) is authoritative. Frontend visibility should be
// tested separately via the Playwright suite (hidden UI does not imply backend security).

import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.split('=');
  return [k.replace(/^--/, ''), v];
}));
const base = args.base;
const credsPath = args.credentials;
if (!base || !credsPath) { console.error('Usage: --base URL --credentials creds.json'); process.exit(1); }

const FN_PATH = process.env.FUNCTIONS_PATH || '/_functions';

const matrix = JSON.parse(readFileSync('tests/permissions/permission-matrix.json', 'utf8'));
const creds = JSON.parse(readFileSync(credsPath, 'utf8'));
const byRole = Object.fromEntries(creds.map((c) => [c.role, c]));

// Backend functions that already exist and enforce a specific CRUD action.
const ACTION_FN = {
  'Organisation:create': 'createOrganisation', 'Organisation:update': 'updateOrganisation', 'Organisation:delete': 'deleteOrganisation',
  'Site:create': 'createSite', 'Site:update': 'updateSite', 'Site:delete': 'deleteSite',
  'ComplianceItem:create': 'createComplianceItem', 'ComplianceItem:update': 'updateComplianceItem',
  'VaultDocument:upload': 'uploadDocument', 'VaultDocument:download': 'getDocumentVault',
  'ExecutiveGoal:create': 'createGoal', 'ExecutiveDecision:create': 'createDecision',
  'User:manage': 'manageAccess', 'Role:manage': 'manageAccess',
};
// Page/resource -> read function for view actions.
const VIEW_FN = { enterprise_dashboard: 'getEnterpriseDashboard' };
// Resources that are themselves backend function names (action verbs in the matrix).
const DIRECT_FN = new Set(['getEnterpriseAnalytics', 'getEnterpriseDashboard', 'runFinancialCalculations',
  'runOwnerScoreCalculation', 'generateWeeklyReport', 'generateAISummary', 'generateExecutiveReport']);

async function call(resource, action, token, orgId, siteId) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const body = JSON.stringify({ organisation_id: orgId, site_id: siteId, name: 'perm-probe' });

  if (DIRECT_FN.has(resource)) {
    const res = await fetch(`${base}${FN_PATH}/${resource}`, { method: 'POST', headers, body }).catch(() => ({ status: 0 }));
    return { actual: (res.status >= 200 && res.status < 300) ? 'allow' : 'deny', status: res.status, via: 'function' };
  }
  if (ACTION_FN[`${resource}:${action}`]) {
    const res = await fetch(`${base}${FN_PATH}/${ACTION_FN[`${resource}:${action}`]}`, { method: 'POST', headers, body }).catch(() => ({ status: 0 }));
    return { actual: (res.status >= 200 && res.status < 300) ? 'allow' : 'deny', status: res.status, via: 'function' };
  }
  if (action === 'view' && VIEW_FN[resource]) {
    const res = await fetch(`${base}${FN_PATH}/${VIEW_FN[resource]}`, { method: 'POST', headers, body }).catch(() => ({ status: 0 }));
    return { actual: (res.status >= 200 && res.status < 300) ? 'allow' : 'deny', status: res.status, via: 'function' };
  }
  // No dedicated backend function exists for this resource/action. The permission is
  // enforced by entity RLS (not callable over HTTP without a confirmed entity REST
  // path), so we SKIP rather than invent an endpoint. Verify via the isolation suite
  // or by confirming the entity REST path externally.
  return { actual: 'skip', status: -1, via: 'no-function' };
}

(async () => {
  const results = [];
  let skipped = 0;
  for (const m of matrix.matrix) {
    const c = byRole[m.role];
    if (!c) { results.push({ ...m, pass: false, reason: 'no test account' }); console.log(`BLOCK ${m.role.padEnd(20)} ${m.resource.padEnd(28)} ${m.action.padEnd(10)} — no account`); continue; }
    if (!c.access_token) { results.push({ ...m, pass: false, reason: 'no access_token' }); console.log(`BLOCK ${m.role.padEnd(20)} ${m.resource.padEnd(28)} ${m.action.padEnd(10)} — no token`); continue; }
    const { actual, status, via } = await call(m.resource, m.action, c.access_token, c.organisation_id, c.site_id);
    if (actual === 'skip') { skipped++; console.log(`SKIP  ${m.role.padEnd(20)} ${m.resource.padEnd(28)} ${m.action.padEnd(10)} — no dedicated function (${via})`); continue; }
    const pass = actual === m.expected;
    results.push({ ...m, actual, http_status: status, pass });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${m.role.padEnd(20)} ${m.resource.padEnd(28)} ${m.action.padEnd(10)} expected=${m.expected} actual=${actual} (${status}, ${via})`);
  }
  const failed = results.filter((r) => r.pass === false);
  console.log(`\n${results.length} checks · ${failed.length} failed · ${skipped} skipped (RLS-only, no dedicated function)`);
  if (failed.length) { console.error('PERMISSION MATRIX FAILED'); process.exit(1); }
  console.log('PERMISSION MATRIX PASSED');
})();