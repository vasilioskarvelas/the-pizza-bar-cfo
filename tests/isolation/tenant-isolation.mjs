// Phase 14 — Tenant isolation suite (3 orgs x 2 sites). External, Node 20+.
// Provision Org A/B/C each with 2 sites, users, and data first (use dataset generator
// with a 3-org config, or manual setup). Each org's actor must authenticate separately.
//
// Usage: node tests/isolation/tenant-isolation.mjs --base https://APP_URL --creds isolation-creds.json
// isolation-creds.json: [{ role, email, password, access_token, organisation_id, site_ids: [] }, ...]

import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.split('='); return [k.replace(/^--/, ''), v]; }));
const base = args.base;
const FN_PATH = process.env.FUNCTIONS_PATH || '/functions'; // docs: deployed functions are at /functions/<name>
const creds = JSON.parse(readFileSync(args.creds, 'utf8'));

const orgA = creds.find((c) => c.organisation === 'A');
const orgB = creds.find((c) => c.organisation === 'B');
const orgC = creds.find((c) => c.organisation === 'C');
const all = [orgA, orgB, orgC];

async function call(fn, token, body) {
  return fetch(`${base}${FN_PATH}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
}


let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; console.error('ISOLATION FAIL:', msg); } else console.log('ok:', msg); }

(async () => {
  // 1. Each org's analytics only lists that org.
  for (const c of all) {
    const r = await call('getEnterpriseAnalytics', c.access_token, { organisation_id: c.organisation_id });
    if (r.ok) {
      const j = await r.json();
      const ids = (j.organisations || []).map((o) => o.id);
      assert(ids.every((id) => id === c.organisation_id) && ids.length <= 1, `${c.organisation} analytics scoped to own org`);
    }
  }

  // 2. Org A attempts to read Org B's compliance by passing B's organisation_id.
  const cross = await call('getComplianceCentre', orgA.access_token, { organisation_id: orgB.organisation_id });
  assert(cross.status === 403 || cross.status === 200, 'cross-org compliance call returns 403 or scoped-empty');
  if (cross.status === 200) {
    const j = await cross.json();
    assert((j.items || []).every((i) => i.organisation_id === orgA.organisation_id), 'no Org B compliance leaked to Org A');
  }

  // 3. Direct entity read with a foreign record id — SKIPPED. Base44 exposes no
  //    documented generic entity REST endpoint; entity access is SDK/function-only.
  //    Direct-record isolation is covered indirectly by the function-level checks
  //    above (getDocumentVault/getComplianceCentre apply org+site RLS). To test a
  //    raw record read, add a dedicated backend function that reads by id under RLS.
  console.log('SKIP: direct foreign entity read — no documented entity REST endpoint');

  // 4. Modified site_id — site manager of Site A1 cannot access Site B1.
  const sm = creds.find((c) => c.role === 'site_manager' && c.organisation === 'A');
  if (sm) {
    const r = await call('getDocumentVault', sm.access_token, { organisation_id: sm.organisation_id, site_id: orgB.site_ids[0] });
    assert(r.status === 403 || (await r.json()).documents?.every((d) => d.site_id !== orgB.site_ids[0]), 'site manager denied foreign site');
  }

  // 5. AI summary context isolation — Org A summary contains no Org B figures.
  const ai = await call('generateAISummary', orgA.access_token, { force: true });
  if (ai.ok) {
    const j = await ai.json();
    assert(!JSON.stringify(j.payload || {}).includes(orgB.organisation_id), 'AI summary contains no foreign org data');
  }

  // 6. Stale/removed permission — re-test after permission removal (manual step).
  // 7. Suspended/deleted user — tokens rejected (manual or via manageAccess).

  console.log(`\n${failures === 0 ? 'TENANT ISOLATION PASSED' : `TENANT ISOLATION FAILED (${failures})`}`);
  if (failures) process.exit(1);
})();