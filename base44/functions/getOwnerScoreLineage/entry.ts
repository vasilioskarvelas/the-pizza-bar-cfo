import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { getOwnerScoreLineage } from "../../shared/ownerScoreRunner.ts";

// Phase 06 — getOwnerScoreLineage: transitive lineage from any score result
// through component scores -> KPI results -> financial results -> canonical
// transactions -> SourceRecords, plus methodology/threshold configuration links.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!body.calculation_result_id) return Response.json({ error: "calculation_result_id required" }, { status: 400 });
    const res = await getOwnerScoreLineage(base44, { resultId: body.calculation_result_id, depth: body.depth || 6 });
    return Response.json(res);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});