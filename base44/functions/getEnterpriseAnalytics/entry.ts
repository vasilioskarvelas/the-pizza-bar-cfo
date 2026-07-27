import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor, extractOrgMetrics } from "../../shared/enterpriseShared.ts";
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

    // Bounded reads (limit 1000) — replaces unbounded .list() that silently truncates
    // at the SDK default page cap. Full-scale (>1000/entity) needs platform pagination.
    const [orgs, calcRuns, goals, risks] = await Promise.all([
      base44.asServiceRole.entities.Organisation.filter({}, "-created_date", 1000),
      base44.asServiceRole.entities.CalculationRun.filter({}, "-created_date", 1000),
      base44.asServiceRole.entities.ExecutiveGoal.filter({}, "-created_date", 1000),
      base44.asServiceRole.entities.ExecutiveRisk.filter({}, "-created_date", 1000),
    ]);
    const scopedOrgs = actor.isPlatformAdmin ? orgs : orgs.filter((o: any) => o.id === actor.orgId);

    const metricsByOrg: Record<string, Record<string, number | null>> = {};
    await Promise.all(scopedOrgs.map(async (org: any) => {
      const m = await extractOrgMetrics(base44, org.id, calcRuns);
      const orgGoals = goals.filter((g: any) => g.organisation_id === org.id);
      const achieved = orgGoals.filter((g: any) => g.status === "achieved").length;
      const goalPct = orgGoals.length ? Math.round((achieved / orgGoals.length) * 100) : null;
      const orgRisks = risks.filter((r: any) => r.organisation_id === org.id);
      metricsByOrg[org.id] = {
        ...m,
        goal_completion_pct: goalPct,
        open_risks: orgRisks.filter((r: any) => ["open", "mitigating"].includes(r.status)).length,
      };
    }));

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