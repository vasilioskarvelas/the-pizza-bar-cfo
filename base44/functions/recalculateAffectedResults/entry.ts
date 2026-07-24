import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, publishEvent } from "../../shared/authEvents.ts";
import { invalidateResults, runEngine } from "../../shared/financialRunner.ts";

// Phase 05 — recalculateAffectedResults: invalidate (mark stale) the current
// financial results for a scope, then run a fresh calculation that supersedes
// the affected downstream outputs. Admin-only. Publishes calculation.recalculated.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { period_start, period_end } = body;
    if (!period_start || !period_end) return Response.json({ error: "period_start and period_end required" }, { status: 400 });

    const inv = await invalidateResults(base44, { orgId: actor.orgId, siteId: body.site_id || null, periodStart: period_start, periodEnd: period_end, actorUserId: actor.actorUserId });
    const res = await runEngine(base44, {
      orgId: actor.orgId, siteId: body.site_id || null, periodStart: period_start, periodEnd: period_end,
      actorUserId: actor.actorUserId, triggeredBy: "recalculation", force: true,
    });
    await publishEvent(base44, { orgId: actor.orgId, siteId: body.site_id, eventKey: "calculation.recalculated", entityType: "CalculationRun", entityId: res.calculation_run_id, message: `Recalculation completed: ${inv.invalidated} prior results marked stale, ${res.superseded} superseded`, actorUserId: actor.actorUserId });
    return Response.json({ invalidated: inv.invalidated, ...res });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});