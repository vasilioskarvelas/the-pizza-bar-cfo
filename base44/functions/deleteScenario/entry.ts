import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, writeAudit, assertOwnership } from "../../shared/authEvents.ts";

// Phase 08 — deleteScenario: remove a scenario + its cached forecast results.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const S = base44.asServiceRole.entities;
    const g = await assertOwnership(base44, "Scenario", body.scenario_id, actor);
    if (!g.ok) return Response.json({ error: g.error }, { status: g.status });
    await S.Scenario.delete(body.scenario_id);
    await S.ForecastResult.deleteMany({ scenario_id: body.scenario_id }).catch(() => {});
    await writeAudit(base44, { orgId: actor.orgId, actionType: "delete", entityType: "Scenario", entityId: body.scenario_id, actorUserId: actor.actorUserId, reason: "scenario deleted" });
    return Response.json({ deleted: true, scenario_id: body.scenario_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});