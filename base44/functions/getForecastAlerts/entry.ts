import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, publishEvent } from "../../shared/authEvents.ts";
import { loadForecastInputs, buildForecast, buildObligations } from "../../shared/forecastRunner.ts";
import { generateForecastAlerts } from "../../shared/forecastEngine.ts";
import { upsertAlerts } from "../../shared/dashboardShared.ts";

// Phase 08 — getForecastAlerts: deterministic forward-looking risk alerts.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const horizon = Number(body.horizon) || 12;
    const inp = await loadForecastInputs(base44, { orgId: actor.orgId, siteId: body.site_id || null, periodStart: body.period_start, period_end: body.period_end });
    const forecast = await buildForecast(base44, { inputs: inp, horizon, actorUserId: actor.actorUserId, useCache: true });
    const obligations = await buildObligations(base44, { orgId: actor.orgId, siteId: body.site_id || null, forecast });
    const alerts = generateForecastAlerts(forecast.periods, obligations);
    const persisted = await upsertAlerts(base44.asServiceRole.entities, actor.orgId, body.site_id || null, alerts, actor.actorUserId);
    await publishEvent(base44, { orgId: actor.orgId, eventKey: "forecast.alerts.generated", entityType: "ExecutiveAlert", message: `${alerts.length} forecast alert(s) generated`, actorUserId: actor.actorUserId });
    return Response.json({
      alerts: persisted, count: persisted.length,
      critical: persisted.filter((a) => a.severity === "critical" && !a.resolved).length,
      high: persisted.filter((a) => a.severity === "high" && !a.resolved).length,
      baseline_period: forecast.baseline_period, horizon_months: horizon,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});