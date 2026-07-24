import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, publishEvent } from "../../shared/authEvents.ts";

// Phase 07 — refreshDashboard: trigger deterministic recalculation (financial + owner score)
// for a scope + period, then return fresh status. Admin-only. No values calculated here.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const period = (body.period_start && body.period_end) ? { periodStart: body.period_start, periodEnd: body.period_end } : null;
    if (!period) return Response.json({ error: "period_start and period_end required" }, { status: 400 });
    const siteId = body.site_id || null;

    const [finR, osR] = await Promise.all([
      base44.functions.invoke("runFinancialCalculations", { period_start: period.periodStart, period_end: period.periodEnd, site_id: siteId, trigger: "dashboard_refresh", force: true }).catch((e) => ({ error: String(e.message || e) })),
      base44.functions.invoke("runOwnerScoreCalculation", { period_start: period.periodStart, period_end: period.periodEnd, site_id: siteId, trigger: "dashboard_refresh", force: true }).catch((e) => ({ error: String(e.message || e) })),
    ]);
    // SDK invoke in Deno returns the response body directly; guard both shapes.
    const fin = finR?.data ?? finR ?? {};
    const os = osR?.data ?? osR ?? {};

    await publishEvent(base44, { orgId: actor.orgId, eventKey: "dashboard.refreshed", message: "Dashboard refreshed", actorUserId: actor.actorUserId, details: JSON.stringify({ siteId, period }) });

    return Response.json({
      financial: { run_id: fin?.calculation_run_id || null, score: fin?.score ?? null, error: fin?.error || null },
      owner_score: { run_id: os?.calculation_run_id || null, score: os?.score ?? null, status: os?.status ?? null, reused: os?.reused ?? null, error: os?.error || null },
      period, generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});