import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { invalidateResults } from "../../shared/financialRunner.ts";

// Phase 05 — invalidateCalculationResults: identifies the current financial
// results for a scope whose inputs have changed and marks them stale
// (audit + event). No mutation of immutable records — staleness is derived from
// the supersession chain created by the next run. Admin-only.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { period_start, period_end } = body;
    if (!period_start || !period_end) return Response.json({ error: "period_start and period_end required" }, { status: 400 });

    const res = await invalidateResults(base44, { orgId: actor.orgId, siteId: body.site_id || null, periodStart: period_start, periodEnd: period_end, actorUserId: actor.actorUserId });
    return Response.json(res);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});