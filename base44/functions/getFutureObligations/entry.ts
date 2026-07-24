import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, writeAudit } from "../../shared/authEvents.ts";
import { loadForecastInputs, buildForecast, buildObligations } from "../../shared/forecastRunner.ts";

// Phase 08 — getFutureObligations: deterministic scheduled obligations, upserted
// into FutureObligation for tracking. Manual entries (no source_ref) are preserved.
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

    const S = base44.asServiceRole.entities;
    // refresh derived obligations (those with a source_ref); keep manual ones.
    const existing = await S.FutureObligation.filter({ organisation_id: actor.orgId });
    const toDelete = existing.filter((o) => o.source_ref && (body.site_id ? o.site_id === body.site_id || !o.site_id : true));
    for (const o of toDelete) await S.FutureObligation.delete(o.id).catch(() => {});
    for (const ob of obligations) {
      await S.FutureObligation.create({
        organisation_id: actor.orgId, site_id: body.site_id || null,
        obligation_type: ob.obligation_type, name: ob.name, due_date: ob.due_date,
        amount_cents: ob.amount_cents, frequency: ob.frequency, priority: ob.priority,
        source_ref: ob.source_ref, forecast_cash_impact_cents: ob.forecast_cash_impact_cents, status: ob.status,
      }).catch(() => {});
    }
    await writeAudit(base44, { orgId: actor.orgId, actionType: "read_sensitive", entityType: "FutureObligation", actorUserId: actor.actorUserId, afterState: JSON.stringify({ count: obligations.length }), reason: "obligations refresh" });

    const total = obligations.reduce((s, o) => s + (o.amount_cents || 0), 0);
    return Response.json({
      obligations, count: obligations.length, total_amount_cents: total,
      by_type: groupBy(obligations, "obligation_type"),
      by_priority: groupBy(obligations, "priority"),
      horizon_months: horizon, generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function groupBy(arr, key) {
  const m = {};
  for (const o of arr) m[o[key]] = (m[o[key]] || 0) + 1;
  return m;
}