import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { defaultPeriod, latestPeriod, previousPeriod, buildKpiCards, buildOwnerScore, reconciliationSummary, connectorSummary, generateAlerts, upsertAlerts } from "../../shared/dashboardShared.ts";
import { getCurrentResults } from "../../shared/financialRunner.ts";

// Phase 07 — getDashboardAlerts: regenerate + persist rule-based alerts, return merged list.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const period = (body.period_start && body.period_end) ? { periodStart: body.period_start, periodEnd: body.period_end } : await latestPeriod(base44.asServiceRole.entities, actor.orgId);
    const siteId = body.site_id || null;
    const prev = previousPeriod(period.periodStart, period.periodEnd); // L1: prior-period comparison

    const [currentRes, prevRes, ownerScore, recon, connectors, calcRuns] = await Promise.all([
      getCurrentResults(base44, { orgId: actor.orgId, siteId, periodStart: period.periodStart, periodEnd: period.periodEnd }),
      getCurrentResults(base44, { orgId: actor.orgId, siteId, periodStart: prev.periodStart, periodEnd: prev.periodEnd }),
      buildOwnerScore(base44, actor.orgId, siteId, period.periodStart, period.periodEnd),
      reconciliationSummary(base44.asServiceRole.entities, actor.orgId, siteId, period.periodStart, period.periodEnd),
      connectorSummary(base44.asServiceRole.entities, actor.orgId, siteId),
      base44.asServiceRole.entities.CalculationRun.filter({ organisation_id: actor.orgId }, "-created_date", 20),
    ]);

    const kpiCards = buildKpiCards(currentRes, prevRes, siteId);
    const alerts = generateAlerts({ orgId: actor.orgId, siteId, ownerScore, kpiCards, recon, connectors, calcRuns, allResults: currentRes });
    const persisted = await upsertAlerts(base44.asServiceRole.entities, actor.orgId, siteId, alerts, actor.actorUserId);

    return Response.json({ count: persisted.length, alerts: persisted, period, generated_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});