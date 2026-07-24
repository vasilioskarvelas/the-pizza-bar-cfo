import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";

// Phase 08 — updateScenario (thin alias to createScenario update). Kept as a
// separate endpoint per the function inventory; delegates to the same handler.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const S = base44.asServiceRole.entities;
    const update = {};
    for (const f of ["name", "description", "status", "color", "baseline_period_start", "baseline_period_end"]) if (body[f] !== undefined) update[f] = body[f];
    if (body.horizon_months != null) update.horizon_months = Number(body.horizon_months);
    if (body.adjustments !== undefined) update.adjustments = JSON.stringify(body.adjustments);
    const rec = await S.Scenario.update(body.scenario_id, update);
    return Response.json({ scenario: { ...rec, adjustments: (() => { try { return JSON.parse(rec.adjustments || "[]"); } catch { return []; } })() } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});