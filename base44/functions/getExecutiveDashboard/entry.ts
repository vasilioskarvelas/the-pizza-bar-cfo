import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import {
  defaultPeriod, previousPeriod, latestPeriod, buildKpiCards, buildOwnerScore,
  reconciliationSummary, connectorSummary, generateAlerts, upsertAlerts,
  BUSINESS_HEALTH,
} from "../../shared/dashboardShared.ts";
import { getCurrentResults } from "../../shared/financialRunner.ts";

// Phase 07 — getExecutiveDashboard: one-call orchestration of every
// deterministic output for the hero, KPI cards, business health, alerts,
// reconciliation, connectors and engine status. No metric is calculated here.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const period = (body.period_start && body.period_end)
      ? { periodStart: body.period_start, periodEnd: body.period_end }
      : await latestPeriod(base44.asServiceRole.entities, actor.orgId);
    const prev = previousPeriod(period.periodStart, period.periodEnd);
    const siteId = body.site_id || null;

    const [currentRes, prevRes, ownerScore, recon, connectors, calcRuns] = await Promise.all([
      getCurrentResults(base44, { orgId: actor.orgId, siteId, periodStart: period.periodStart, periodEnd: period.periodEnd }),
      getCurrentResults(base44, { orgId: actor.orgId, siteId, periodStart: prev.periodStart, periodEnd: prev.periodEnd }),
      buildOwnerScore(base44, actor.orgId, siteId, period.periodStart, period.periodEnd),
      reconciliationSummary(base44.asServiceRole.entities, actor.orgId, siteId, period.periodStart, period.periodEnd),
      connectorSummary(base44.asServiceRole.entities, actor.orgId, siteId),
      base44.asServiceRole.entities.CalculationRun.filter({ organisation_id: actor.orgId }, "-created_date", 20),
    ]);

    const kpiCards = buildKpiCards(currentRes, prevRes, siteId);
    const businessHealth = BUSINESS_HEALTH.map((b) => {
      if (b.code === "owner_score") {
        return { ...b, score: ownerScore.current?.score?.value ?? null, status: ownerScore.current?.score?.label?.replace("Owner Score — ", "") || null, confidence: ownerScore.current?.score?.confidence || null, trend: ownerScore.trend, updated: ownerScore.current?.score?.run?.run_completed_at || null };
      }
      const comp = ownerScore.current?.components?.find((c) => c.code === b.code);
      return { ...b, score: comp?.score ?? null, confidence: comp?.confidence ?? null, trend: "no_prior", updated: ownerScore.current?.score?.run?.run_completed_at || null };
    });

    const alerts = generateAlerts({ orgId: actor.orgId, siteId, ownerScore, kpiCards, recon, connectors, calcRuns, allResults: currentRes });
    const persistedAlerts = await upsertAlerts(base44.asServiceRole.entities, actor.orgId, siteId, alerts, actor.actorUserId);

    const osResults = await base44.asServiceRole.entities.CalculationResult.filter({ organisation_id: actor.orgId, result_type: "score_component", entity_type: "owner_score", period_start: period.periodStart, period_end: period.periodEnd }, "-created_date", 30);
    const osResultId = (osResults.find((r) => (r.site_id || null) === (siteId || null) && r.methodology_component_id == null) || osResults.find((r) => r.methodology_component_id == null) || { id: null }).id;

    return Response.json({
      period: period, previous_period: prev, site_id: siteId,
      owner_score: ownerScore,
      owner_score_result_id: osResultId,
      kpi_cards: kpiCards,
      business_health: businessHealth,
      alerts: persistedAlerts,
      alerts_summary: {
        critical: persistedAlerts.filter((a) => a.severity === "critical" && !a.resolved).length,
        high: persistedAlerts.filter((a) => a.severity === "high" && !a.resolved).length,
        medium: persistedAlerts.filter((a) => a.severity === "medium" && !a.resolved).length,
        low: persistedAlerts.filter((a) => a.severity === "low" && !a.resolved).length,
        acknowledged: persistedAlerts.filter((a) => a.acknowledged).length,
        resolved: persistedAlerts.filter((a) => a.resolved).length,
      },
      reconciliation: recon,
      connectors: connectors,
      engine_status: {
        financial: ownerScore.current?.score?.run ? { status: ownerScore.current.score.run.status, completed_at: ownerScore.current.score.run.run_completed_at, engine_version: "financial-engine-1.0" } : null,
        owner_score: ownerScore.current?.score?.run ? { status: ownerScore.current.score.run.status, completed_at: ownerScore.current.score.run.run_completed_at, engine_version: "owner-score-engine-1.0", methodology_version_id: ownerScore.current.score.run.methodology_version_id } : null,
        recent_calc_runs: calcRuns.slice(0, 10).map((r) => ({ id: r.id, run_type: r.run_type, status: r.status, started_at: r.run_started_at, completed_at: r.run_completed_at })),
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});