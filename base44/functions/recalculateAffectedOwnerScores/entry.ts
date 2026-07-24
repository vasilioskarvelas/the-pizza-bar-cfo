import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { invalidateOwnerScores, runOwnerScore } from "../../shared/ownerScoreRunner.ts";
import { publishEvent, writeAudit, now } from "../../shared/authEvents.ts";

// Phase 06 — recalculateAffectedOwnerScores: invalidate stale score results for a
// scope+period, then recompute. Admin-only (or scheduled). Publishes
// owner_score.recalculated. Full supersession preserves prior scores.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const { period_start, period_end } = body;
    if (!period_start || !period_end) return Response.json({ error: "period_start and period_end required" }, { status: 400 });

    const inv = await invalidateOwnerScores(base44, { orgId: actor.orgId, siteId: body.site_id || null, periodStart: period_start, periodEnd: period_end, actorUserId: actor.actorUserId });
    const res = await runOwnerScore(base44, { orgId: actor.orgId, siteId: body.site_id || null, periodStart: period_start, periodEnd: period_end, actorUserId: actor.actorUserId, triggeredBy: "recalculation", force: true });
    await publishEvent(base44, { orgId: actor.orgId, siteId: body.site_id || null, eventKey: "owner_score.recalculated", entityType: "CalculationRun", entityId: res.calculation_run_id, message: `Owner Score recalculated (${inv.invalidated} invalidated)`, actorUserId: actor.actorUserId });
    await writeAudit(base44, { orgId: actor.orgId, actionType: "create", entityType: "CalculationRun", entityId: res.calculation_run_id, actorUserId: actor.actorUserId, afterState: JSON.stringify({ invalidated: inv.invalidated, run: res.calculation_run_id }), reason: "owner score recalculation" });
    return Response.json({ ...res, invalidated: inv.invalidated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});