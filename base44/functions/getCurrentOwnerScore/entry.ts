import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { getCurrentOwnerScore } from "../../shared/ownerScoreRunner.ts";

// Phase 06 — getCurrentOwnerScore: read the current (latest) Owner Score for a
// scope + period, with component scores, companions and run metadata. Admin-only.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const res = await getCurrentOwnerScore(base44, { orgId: actor.orgId, siteId: body.site_id || null, periodStart: body.period_start || null, periodEnd: body.period_end || null });
    return Response.json(res);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});