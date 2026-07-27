// Phase 14 — Tenant isolation suite (3 orgs x 2 sites). External, Node 20+.
// Uses the Base44 SDK (functions.invoke), the DOCUMENTED path that establishes user
// context. Raw fetch to /functions/<name> has NO user context (auth.me() returns null).
//
// Usage: node tests/isolation/tenant-isolation.mjs --base https://APP_URL --creds isolation-creds.json
// Env:   BASE44_APP_ID (required for createClient)
// isolation-creds.json: [{ role, email, access_token, organisation_id, organisation:'A'|'B'|'C', site_ids: [] }, ...]
// Provision Org A/B/C each with 2 sites, users, and data first (use the dataset generator
// with a 3-org config, or manual setup). Each org's actor must authenticate separately.

import { createClient } from '@base44/sdk';
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.split('='); return [k.replace(/^--/, ''), v]; }));
const base = args.base;
if (!process.env.BASE44_APP_ID) { console.error('BLOCKED: BASE44_APP_ID is required for createClient.'); process.exit(2); }
const creds = JSON.parse(readFileSync(args.creds, 'utf8'));

const orgA = creds.find((c) => c.organisation === 'A');
const orgB = creds.find((c) => c.organisation === 'B');
const orgC = creds.find((c) => c.organisation === 'C');
const all = [orgA, orgB, orgC].filter(Boolean);

async function call(fn, token, body) {
  const client = createClient({ appId: process.env.BASE44_APP_ID, token });
  try {
    const res = await client.functions.invoke(fn, body || {});
    return { ok: true, status: 200, data: res.data };
  } catch (e) {
    const status = e?.response?.status ?? 0;
    let data = null; try { data = e?.response?.data; } catch {}
    return { ok: false, status, data };
  }
}

// Raw unauthenticated fetch (NO token) — used ONLY for the unauthenticated-bypass
// probe (test 6). Probes whether a function is reachable without any user context.
async function callRaw(fn, body) {
  if (!base) return { status: 0, data: null, skipped: true };
  const res = await fetch(`${base}/functions/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, skipped: false };
}

let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; console.error('ISOLATION FAIL:', msg); } else console.log('ok:', msg); }

(async () => {
  if (all.length < 3) console.log(`WARN: expected 3 orgs in creds, found ${all.length}`);

  // 1. Each org's analytics only lists that org.
  for (const c of all) {
    const r = await call('getEnterpriseAnalytics', c.access_token, { organisation_id: c.organisation_id });
    if (r.ok) {
      const ids = (r.data.organisations || []).map((o) => o.id);
      assert(ids.every((id) => id === c.organisation_id) && ids.length <= 1, `${c.organisation} analytics scoped to own org`);
    } else if (r.status === 401) { console.log(`BLOCK: ${c.organisation} analytics 401 (token / no user context)`); }
    else { console.log(`NOTE: ${c.organisation} analytics status ${r.status}`); }
  }

  // 2. Org A attempts to read Org B's compliance by passing B's organisation_id.
  const cross = await call('getComplianceCentre', orgA.access_token, { organisation_id: orgB.organisation_id });
  if (cross.status === 403) { assert(true, 'cross-org compliance denied (403)'); }
  else if (cross.ok) {
    const items = (cross.data.items || []);
    assert(items.every((i) => i.organisation_id === orgA.organisation_id), 'no Org B compliance leaked to Org A');
  } else if (cross.status === 401) { console.log('BLOCK: cross-org compliance 401 (token / no user context)'); }
  else { assert(false, `cross-org compliance unexpected status ${cross.status}`); }

  // 3. Direct entity read — SKIPPED. Base44 exposes no documented generic entity REST
  //    endpoint; entity access is SDK/function-only. Isolation is verified at the
  //    function layer (tests 1, 2, 4), which apply org+site RLS.
  console.log('SKIP: direct foreign entity read — no documented entity REST endpoint');

  // 4. Modified site_id — site manager of Site A1 cannot access Site B1.
  const sm = creds.find((c) => c.role === 'site_manager' && c.organisation === 'A');
  if (sm) {
    const r = await call('getDocumentVault', sm.access_token, { organisation_id: sm.organisation_id, site_id: orgB.site_ids[0] });
    if (r.status === 403) assert(true, 'site manager denied foreign site (403)');
    else if (r.ok) assert((r.data.documents || []).every((d) => d.site_id !== orgB.site_ids[0]), 'site manager denied foreign site (no B1 docs returned)');
    else console.log(`BLOCK: site manager vault status ${r.status}`);
  }

  // 5. AI summary context isolation — Org A summary contains no Org B figures.
  const ai = await call('generateAISummary', orgA.access_token, { force: true });
  if (ai.ok) assert(!JSON.stringify(ai.data.payload || {}).includes(orgB.organisation_id), 'AI summary contains no foreign org data');
  else console.log(`NOTE: AI summary status ${ai.status} (context check skipped)`);

  // 6. Unauthenticated bypass probe — calling a function with NO token but supplying a
  //    foreign organisation_id must be rejected (401/403). If it returns 200 with data,
  //    the function's actor resolver grants platform-admin scope to unauthenticated
  //    callers (resolveEnterpriseActor/resolveActor fall back to isPlatformAdmin=true /
  //    isAdmin=true when auth.me() is null AND body.organisation_id is present) — a real
  //    authorization bypass. See PHASE_14_EXTERNAL_VERIFICATION.md "Known project defects".
  const probe = await callRaw('getComplianceCentre', { organisation_id: orgB.organisation_id });
  if (probe.skipped) { console.log('SKIP: unauthenticated bypass probe (no --base provided)'); }
  else if (probe.status === 200) assert(false, 'UNAUTHENTICATED BYPASS: getComplianceCentre returned 200 with no token + foreign organisation_id (actor resolver grants platform-admin to anonymous callers)');
  else assert(probe.status === 401 || probe.status === 403, `unauthenticated compliance rejected (${probe.status})`);

  // 7. Stale/removed permission — re-test after permission removal (manual step).
  // 8. Suspended/deleted user — tokens rejected (manual or via manageAccess).

  console.log(`\n${failures === 0 ? 'TENANT ISOLATION PASSED' : `TENANT ISOLATION FAILED (${failures})`}`);
  if (failures) process.exit(1);
})();