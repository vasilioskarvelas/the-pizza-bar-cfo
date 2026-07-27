// Phase 14 — Permission matrix runner. Executes the matrix against authenticated
// sessions via the Base44 SDK (functions.invoke), which is the DOCUMENTED path that
// establishes user context. Raw fetch to /functions/<name> has NO user context
// (base44.auth.me() returns null per the docs), so this runner does NOT use fetch.
// External, Node 20+. Requires provisioned test accounts (see manifests/test-accounts.json).
//
// Usage: node tests/permissions/run-permission-matrix.mjs --credentials creds.json
// Env:   BASE44_APP_ID (required — createClient needs appId)
// creds.json: [{ role, email, access_token, organisation_id, site_id }]
//   access_token is the Base44 access token obtained after login (auth is SDK/client-side,
//   so the runner cannot log in for you — supply tokens in creds).
//
// Method: each probe sends an EMPTY body. Every target function checks auth (401/403)
// BEFORE input validation (400), so:
//   403          = DENY  (the permission gate held)
//   400/404/409  = ALLOW (passed the auth gate, then failed validation — NO side effect,
//                        no record created/updated/deleted)
//   200/2xx      = ALLOW (read succeeded)
//   401          = BLOCK (token invalid / no user context — do NOT count as pass or fail)
//   500/0        = ERROR (inconclusive — do NOT count as pass)
// This proves the auth gate without mutating the tenant. A mismatch (expected≠actual)
// means EITHER an over-permissive function OR an over-strict matrix expectation — both
// are real findings to review before launch; the runner never silently "fixes" either.

import { createClient } from '@base44/sdk';
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.split('=');
  return [k.replace(/^--/, ''), v];
}));
const credsPath = args.credentials;
if (!credsPath) { console.error('Usage: --credentials creds.json'); process.exit(1); }
if (!process.env.BASE44_APP_ID) { console.error('BLOCKED: BASE44_APP_ID is required for createClient.'); process.exit(2); }

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
const VIEW_FN = { enterprise_dashboard: 'getEnterpriseDashboard' };
const DIRECT_FN = new Set(['getEnterpriseAnalytics', 'getEnterpriseDashboard', 'runFinancialCalculations',
  'runOwnerScoreCalculation', 'generateWeeklyReport', 'generateAISummary', 'generateExecutiveReport']);

function fnFor(resource, action) {
  if (DIRECT_FN.has(resource)) return resource;
  if (ACTION_FN[`${resource}:${action}`]) return ACTION_FN[`${resource}:${action}`];
  if (action === 'view' && VIEW_FN[resource]) return VIEW_FN[resource];
  return null;
}

async function probe(fn, token) {
  const client = createClient({ appId: process.env.BASE44_APP_ID, token });
  try {
    await client.functions.invoke(fn, {});
    return { actual: 'allow', status: 200 };
  } catch (e) {
    const status = e?.response?.status ?? 0;
    if (status === 403) return { actual: 'deny', status };
    if (status === 401) return { actual: 'block', status };
    if (status === 400 || status === 404 || status === 409 || status === 422) return { actual: 'allow', status };
    return { actual: 'error', status };
  }
}

(async () => {
  const results = [];
  let skipped = 0, blocked = 0, errored = 0;
  for (const m of matrix.matrix) {
    const c = byRole[m.role];
    const label = `${m.role.padEnd(20)} ${m.resource.padEnd(28)} ${m.action.padEnd(10)}`;
    if (!c) { console.log(`BLOCK ${label} — no account`); blocked++; continue; }
    if (!c.access_token) { console.log(`BLOCK ${label} — no access_token`); blocked++; continue; }
    const fn = fnFor(m.resource, m.action);
    if (!fn) { skipped++; console.log(`SKIP  ${label} — no dedicated function (RLS-only)`); continue; }
    const { actual, status } = await probe(fn, c.access_token);
    if (actual === 'block') { blocked++; console.log(`BLOCK ${label} — 401 (token invalid / no user context: ${status})`); continue; }
    if (actual === 'error') { errored++; console.log(`ERROR ${label} — status ${status} (inconclusive)`); continue; }
    const pass = actual === m.expected;
    results.push({ ...m, actual, http_status: status, pass });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${label} expected=${m.expected} actual=${actual} (${status})`);
  }
  const failed = results.filter((r) => r.pass === false);
  console.log(`\n${results.length} checks · ${failed.length} failed · ${skipped} skipped · ${blocked} blocked · ${errored} errors`);
  if (failed.length) { console.error('PERMISSION MATRIX FAILED — each FAIL is either an over-permissive function or an over-strict expectation; review before launch.'); process.exit(1); }
  if (blocked || errored) { console.error('PERMISSION MATRIX INCONCLUSIVE — resolve BLOCK/ERROR rows before sign-off.'); process.exit(2); }
  console.log('PERMISSION MATRIX PASSED (all executable checks)');
})();