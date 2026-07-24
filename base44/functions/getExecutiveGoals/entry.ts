import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { listGoals } from "../../shared/executivePlanningRunner.ts";

// Phase 09 — getExecutiveGoals: read goals with deterministic progress + forecast.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const goals = await listGoals(base44, { orgId: actor.orgId, siteId: body.site_id || null });
    return Response.json({ goals, count: goals.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});