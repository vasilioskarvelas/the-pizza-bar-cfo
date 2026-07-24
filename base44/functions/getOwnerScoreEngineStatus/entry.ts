import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { getOwnerScoreEngineStatus } from "../../shared/ownerScoreRunner.ts";

// Phase 06 — getOwnerScoreEngineStatus: engine health — latest run, total runs,
// current vs superseded score results, active methodology.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const res = await getOwnerScoreEngineStatus(base44, { orgId: actor.orgId });
    return Response.json(res);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});