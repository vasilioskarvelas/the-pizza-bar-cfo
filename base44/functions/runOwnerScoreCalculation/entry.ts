import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { runOwnerScore } from "../../shared/ownerScoreRunner.ts";

// Phase 06 — runOwnerScoreCalculation: manual trigger of the deterministic
// Owner Score engine for a scope (org, optional site) and period. Admin-only
// (or scheduled). Cache reuse + supersession + full lineage. No AI.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const { period_start, period_end } = body;
    if (!period_start || !period_end) return Response.json({ error: "period_start and period_end required" }, { status: 400 });
    const res = await runOwnerScore(base44, {
      orgId: actor.orgId, siteId: body.site_id || null, periodStart: period_start, periodEnd: period_end,
      actorUserId: actor.actorUserId, triggeredBy: body.trigger || "manual", force: !!body.force,
    });
    return Response.json(res);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});