import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { loadForecastInputs, buildForecast } from "../../shared/forecastRunner.ts";

// Phase 08 — getForecast: deterministic baseline forecast (cached).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const horizon = Number(body.horizon) || 12;
    const inp = await loadForecastInputs(base44, { orgId: actor.orgId, siteId: body.site_id || null, periodStart: body.period_start, period_end: body.period_end });
    const payload = await buildForecast(base44, { inputs: inp, horizon, actorUserId: actor.actorUserId, useCache: true });
    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});