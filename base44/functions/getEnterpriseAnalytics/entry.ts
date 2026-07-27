import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { benchmark, ENTERPRISE_ENGINE_VERSION } from "../../shared/enterpriseEngine.ts";

// Phase 13 — getEnterpriseAnalytics: cross-organisation comparison + benchmarking.
// Builds a per-org metric map from the latest CalculationResult snapshot of each
// org, then benchmarks each metric (rank, percentile, delta vs mean).

const FIELDS = [
  { code: "revenue", direction: "maximize" as const },
  { code: "net_profit", direction: "maximize" as const },
  { code: "cash", direction: "maximize" as const },
  { code: "labour_pct", direction: "minimize" as const },
  { code: "food_cost_pct", direction: "minimize" as const },
  { code: "debt", direction: "minimize" as const },
  { code: "owner_score", direction: "maximize" as const },
  { code: "goal_completion_pct", direction: "maximize" as const },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin && !actor.orgId) return Response.json({ error: "Forbidden" }, { status: 403 });

    const [orgs, calcRuns, goals, risks] = await Promise.all([
      base44.asServiceRole.entities.Organisation.list(),
      base44.asServiceRole.entities.CalculationRun.list(),
      base44.asServiceRole.entities.ExecutiveGoal.list(),
      base44.asServiceRole.entities.ExecutiveRisk.list(),
    ]);
    const scopedOrgs = actor.isPlatformAdmin ? orgs : orgs.filter((o: any) => o.id === actor.orgId);

    const allResults = calcRuns.length ? await base44.asServiceRole.entities.CalculationResult.list() : [];
    const metricsByOrg: Record<string, Record<string, number>> = {};
    for (const org of scopedOrgs) {
      const orgRunIds = new Set(calcRuns.filter((r: any) => r.organisation_id === org.id).map((r: any) => r.id));
      const orgResults = allResults.filter((r: any) => orgRunIds.has(r.run_id));
      const latest = orgResults.sort((a: any, b: any) => (b.created_date || "").localeCompare(a.created_date || ""))[0];
      const m = latest?.metrics || {};
      const orgGoals = goals.filter((g: any) => g.organisation_id === org.id);
      const achieved = orgGoals.filter((g: any) => g.status === "achieved").length;
      const goalPct = orgGoals.length ? Math.round((achieved / orgGoals.length) * 100) : null;
      const orgRisks = risks.filter((r: any) => r.organisation_id === org.id);
      metricsByOrg[org.id] = {
        revenue: num(m.revenue ?? m.total_revenue),
        net_profit: num(m.net_profit ?? m.profit),
        cash: num(m.cash ?? m.cash_position),
        labour_pct: num(m.labour_pct ?? m.labour_percent),
        food_cost_pct: num(m.food_cost_pct ?? m.food_cost_percent),
        debt: num(m.debt ?? m.total_debt),
        owner_score: num(m.owner_score),
        goal_completion_pct: goalPct,
        open_risks: orgRisks.filter((r: any) => ["open","mitigating"].includes(r.status)).length,
      };
    }
    const benchmarks = benchmark(metricsByOrg, FIELDS);
    return Response.json({
      engine_version: ENTERPRISE_ENGINE_VERSION, generated_at: new Date().toISOString(),
      organisations: scopedOrgs.map((o: any) => ({ id: o.id, name: o.name, type: o.organisation_type, status: o.status })),
      metrics_by_org: metricsByOrg, benchmarks,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function num(v: any): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }