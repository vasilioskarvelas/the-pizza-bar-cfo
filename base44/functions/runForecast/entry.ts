import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, writeAudit } from "../../shared/authEvents.ts";

// Phase 08 — runForecast: force a fresh deterministic forecast (cache bypass).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const horizon = Number(body.horizon) || 12;
    const { loadForecastInputs, buildForecast } = await import("../../shared/forecastRunner.ts");
    const inp = await loadForecastInputs(base44, { orgId: actor.orgId, siteId: body.site_id || null, periodStart: body.period_start, period_end: body.period_end });
    const payload = await buildForecast(base44, { inputs: inp, horizon, actorUserId: actor.actorUserId, useCache: false });
    await writeAudit(base44, { orgId: actor.orgId, actionType: "read_sensitive", entityType: "ForecastResult", actorUserId: actor.actorUserId, afterState: JSON.stringify({ hash: payload.cache?.hash, horizon, forced: true }), reason: "forecast refresh (cache bypass)" });
    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});