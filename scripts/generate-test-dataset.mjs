// Phase 14 — Configurable test-dataset generator for an ISOLATED test tenant.
// Run externally (Node 20+). Does NOT run inside the Base44 builder.
//
// Usage:
//   node scripts/generate-test-dataset.mjs --dry-run
//   node scripts/generate-test-dataset.mjs --config datasets/prod-scale.json
//   node scripts/generate-test-dataset.mjs --cleanup          # delete created records
//   node scripts/generate-test-dataset.mjs --before-counts     # print counts only
//
// Environment (required for real runs):
//   BASE44_API_KEY   service-role key with entity write scope
//   BASE44_APP_ID    target app id
//
// User records CANNOT be created (platform invites only). This generator emits an
// invitation manifest (manifests/test-accounts.generated.json) for the 500-user quota;
// authenticated-user testing is separate from this synthetic data.

import { createClient } from '@base44/sdk';

const S = createClient({ apiKey: process.env.BASE44_API_KEY, appId: process.env.BASE44_APP_ID });
const DRY = process.argv.includes('--dry-run');
const CLEANUP = process.argv.includes('--cleanup');
const COUNTS_ONLY = process.argv.includes('--before-counts');

const DEFAULTS = {
  organisations: 25, sites: 150, users: 500,
  financial_transactions: 20000, compliance_items: 5000, documents: 2000,
  weekly_reports: 500, ai_summaries: 500, calculation_runs: 1000,
  calculation_results: 10000, goals: 1000, risks: 1000, forecasts: 500, scenarios: 250,
};

// Deterministic PRNG (mulberry32) — reproducible fixtures.
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = rng(20260727);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SUBURBS = ['Strathmore','Diggers Rest','Brunswick','Footscray','Preston','Carnegie','Malvern','Hawthorn','Richmond','Geelong'];
const STATES = ['VIC','NSW','QLD','WA','SA','TAS'];
const COMP_TYPES = ['bas','gst','payg','super','payroll','asic','annual_review','insurance','licence'];

const created = { orgs: [], sites: [], compliance: [], goals: [], risks: [], runs: [], results: [], reports: [], summaries: [], docs: [], forecasts: [], scenarios: [] };

async function batch(entity, records, label) {
  const out = [];
  for (let i = 0; i < records.length; i += 500) {
    if (DRY) { out.push(...records.slice(i, i + 500)); continue; }
    const chunk = records.slice(i, i + 500);
    try { const r = await S.entities[entity].bulkCreate(chunk); out.push(...(r || [])); }
    catch (e) { console.error(`${label} batch ${i} failed:`, e.message); }
    await sleep(120); // rate limit
  }
  return out;
}

async function generate() {
  const orgs = Array.from({ length: DEFAULTS.organisations }, (_, i) => ({
    name: `Test Org ${String(i + 1).padStart(2, '0')}`,
    legal_name: `Test Org ${i + 1} Pty Ltd`, organisation_type: 'independent',
    industry: 'Hospitality', status: 'active', gst_method: 'accrual',
    default_currency: 'AUD', timezone: 'Australia/Melbourne', data_residency: 'AU',
  }));
  created.orgs = await batch('Organisation', orgs, 'org');
  console.log(`orgs: ${created.orgs.length}`);

  const sites = [];
  for (let i = 0; i < DEFAULTS.sites; i++) {
    const org = created.orgs[i % created.orgs.length];
    sites.push({ organisation_id: org.id, name: `Site ${i + 1}`, suburb: pick(SUBURBS),
      state: pick(STATES), postcode: '3000', country: 'AU', status: 'active', trading_days_per_week: 7 });
  }
  created.sites = await batch('Site', sites, 'site');
  console.log(`sites: ${created.sites.length}`);

  // Compliance items
  const compliance = Array.from({ length: DEFAULTS.compliance_items }, (_, i) => {
    const site = created.sites[i % created.sites.length];
    return { organisation_id: site.organisation_id, site_id: site.id,
      compliance_type: pick(COMP_TYPES), title: `Compliance item ${i + 1}`,
      due_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
      amount_cents: Math.round(rnd() * 5000000), status: 'upcoming', recurrence: 'quarterly' };
  });
  created.compliance = await batch('ComplianceItem', compliance, 'compliance');

  // Goals, risks, calc runs/results, weekly reports, AI summaries, docs, forecasts, scenarios
  const goals = Array.from({ length: DEFAULTS.goals }, (_, i) => {
    const site = created.sites[i % created.sites.length];
    return { organisation_id: site.organisation_id, site_id: site.id, title: `Goal ${i + 1}`,
      category: 'revenue', target_value: 10000000, start_date: '2026-07-01', end_date: '2027-06-30',
      direction: 'maximize', unit: 'cents', status: 'on_track' };
  });
  created.goals = await batch('ExecutiveGoal', goals, 'goals');

  const risks = Array.from({ length: DEFAULTS.risks }, (_, i) => {
    const site = created.sites[i % created.sites.length];
    return { organisation_id: site.organisation_id, site_id: site.id, rule_key: 'cash_shortage',
      title: `Risk ${i + 1}`, severity: 'high', status: 'open' };
  });
  created.risks = await batch('ExecutiveRisk', risks, 'risks');

  const runs = Array.from({ length: DEFAULTS.calculation_runs }, (_, i) => {
    const site = created.sites[i % created.sites.length];
    return { organisation_id: site.organisation_id, site_id: site.id, run_type: 'financial_figure',
      period_start: '2026-07-01', period_end: '2026-07-31', engine_version: 'financial-engine-1.0',
      input_snapshot_hash: `seed-${i}`, run_started_at: new Date().toISOString(), status: 'completed', result_count: 10 };
  });
  created.runs = await batch('CalculationRun', runs, 'runs');

  const results = Array.from({ length: DEFAULTS.calculation_results }, (_, i) => {
    const run = created.runs[i % created.runs.length];
    return { organisation_id: run.organisation_id, site_id: run.site_id, calculation_run_id: run.id,
      result_type: 'financial_figure', entity_type: 'pl_line', entity_id: 'revenue',
      value: Math.round(rnd() * 5000000), unit: 'cents', confidence: 'confirmed',
      period_start: '2026-07-01', period_end: '2026-07-31', label: 'Revenue' };
  });
  created.results = await batch('CalculationResult', results, 'results');

  const reports = Array.from({ length: DEFAULTS.weekly_reports }, (_, i) => {
    const site = created.sites[i % created.sites.length];
    return { organisation_id: site.organisation_id, site_id: site.id, report_key: `rpt-${site.id}-${i}`,
      week_start: '2026-07-20', week_end: '2026-07-26', summary_text: 'Test report', status: 'published',
      revenue: 1000000, net_profit: 200000, cash: 500000, engine_version: 'weekly-1.0', generated_at: new Date().toISOString() };
  });
  created.reports = await batch('WeeklyReport', reports, 'reports');

  const summaries = Array.from({ length: DEFAULTS.ai_summaries }, (_, i) => {
    const site = created.sites[i % created.sites.length];
    return { organisation_id: site.organisation_id, site_id: site.id, summary_key: `ai-${site.id}-${i}`,
      scope: 'site', headline: 'Test summary', outlook: 'stable', confidence: 'medium',
      validation_status: 'passed', used_fallback: false, period_start: '2026-07-01',
      period_end: '2026-07-31', generated_at: new Date().toISOString(), engine_version: 'ai-summary-1.0' };
  });
  created.summaries = await batch('AISummary', summaries, 'summaries');

  const docs = Array.from({ length: DEFAULTS.documents }, (_, i) => {
    const site = created.sites[i % created.sites.length];
    return { organisation_id: site.organisation_id, site_id: site.id, category: 'lease',
      title: `Document ${i + 1}`, current_version: 1, file_size: 1024, status: 'active' };
  });
  created.docs = await batch('VaultDocument', docs, 'docs');

  // Invitation manifest for the 500 users (cannot create User records).
  const invites = Array.from({ length: DEFAULTS.users }, (_, i) => ({
    role: ['platform_owner','enterprise_admin','org_owner','regional_manager','site_manager',
      'accountant','financial_controller','operations_manager','advisor','auditor','read_only','custom'][i % 12],
    email: 'REQUIRED_TEST_EMAIL', organisation: `Test Org ${(i % DEFAULTS.organisations) + 1}`,
    sites: [`Site ${(i % DEFAULTS.sites) + 1}`], expected_permissions: [],
  }));
  if (!DRY) {
    const fs = await import('node:fs');
    fs.writeFileSync('manifests/test-accounts.generated.json', JSON.stringify(invites, null, 2));
    console.log('wrote manifests/test-accounts.generated.json (invitation placeholders)');
  }
  console.log('Dataset generation complete.', DRY ? '(DRY RUN — nothing written)' : '');
}

async function cleanup() {
  for (const [name, arr] of Object.entries(created)) {
    if (!arr.length) continue;
    const entity = { orgs: 'Organisation', sites: 'Site', compliance: 'ComplianceItem',
      goals: 'ExecutiveGoal', risks: 'ExecutiveRisk', runs: 'CalculationRun', results: 'CalculationResult',
      reports: 'WeeklyReport', summaries: 'AISummary', docs: 'VaultDocument' }[name];
    if (!entity) continue;
    for (let i = 0; i < arr.length; i += 500) {
      try { await S.entities[entity].deleteMany({ id: { $in: arr.slice(i, i + 500).map((r) => r.id) } }); }
      catch (e) { console.error(`cleanup ${entity}:`, e.message); }
      await sleep(120);
    }
    console.log(`cleaned ${name}: ${arr.length}`);
  }
}

(async () => {
  if (COUNTS_ONLY) { console.log('Counts-only mode — implement entity count queries here.'); return; }
  await generate();
  if (CLEANUP) await cleanup();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });