// Phase 14H — Phase 2 regression test for C3 (cross-tenant PayRun leak).
// buildObligations must include payroll only for the caller org's own sites.
// PayRun carries no organisation_id, so scoping is via the org's Site ids.
//
//   Run:  deno test base44/shared/forecastRunner.test.ts
//
// Pure dependency injection: buildObligations takes `base44` as a parameter, so a
// mock service-role client suffices (no SDK / network).

import { buildObligations } from "./forecastRunner.ts";

function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Mock base44: Site.filter returns this org's sites; PayRun is read via the M3
// listAll() helper, which pages through `.filter(query, order, limit, skip)` — so
// the mock returns all payruns on page 0 and an empty page thereafter (pagination
// terminates). A mix of own-org and foreign payruns is supplied; commitments empty.
function mkBase44(orgSites: any[], payruns: any[]) {
  return {
    asServiceRole: {
      entities: {
        Site: { filter: async () => orgSites },
        ManualCommitment: { filter: async () => [] },
        CommitmentVersion: { filter: async () => [] },
        PayRun: { filter: async (_q: any, _order: any, _limit: number, skip: number) => ((skip || 0) > 0 ? [] : payruns) },
      },
    },
  };
}

Deno.test("buildObligations: excludes payruns from other orgs' sites (C3)", async () => {
  const base44 = mkBase44(
    [{ id: "siteA1" }, { id: "siteA2" }], // org A owns these sites
    [
      { site_id: "siteA1", site_name: "A1", net_pay: 1000, payment_date: "2026-02-01", period_end: "2026-01-31" },
      { site_id: "siteB9", site_name: "FOREIGN-ORG-B", net_pay: 9999, payment_date: "2026-02-01", period_end: "2026-01-31" },
    ],
  );
  const out = await buildObligations(base44, { orgId: "orgA", siteId: null, forecast: null });
  const payroll = out.filter((o: any) => o.obligation_type === "payroll");
  eq(payroll.length, 1, "only the org's own-site payroll should be included");
  eq(payroll[0].name.includes("FOREIGN-ORG-B"), false, "foreign org payroll must not leak in");
  eq(payroll[0].amount_cents, 100000, "own-site payroll amount preserved (1000 * 100)");
});

Deno.test("buildObligations: org with no matching sites yields no payroll (fail-closed)", async () => {
  const base44 = mkBase44(
    [], // org owns no sites
    [{ site_id: "siteB9", site_name: "FOREIGN", net_pay: 9999, payment_date: "2026-02-01", period_end: "2026-01-31" }],
  );
  const out = await buildObligations(base44, { orgId: "orgA", siteId: null, forecast: null });
  eq(out.filter((o: any) => o.obligation_type === "payroll").length, 0);
});
