import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { getLineage } from "../../shared/financialRunner.ts";

// Phase 05 — getCalculationLineage: returns the lineage chain for a calculation
// result, drilling down through intermediate CalculationResults to the source
// SourceRecord. Admin-only. Supports drill-down to SourceRecord.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const resultId = body.calculation_result_id;
    if (!resultId) return Response.json({ error: "calculation_result_id required" }, { status: 400 });

    const res = await getLineage(base44, { resultId });
    return Response.json(res);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});