import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, writeAudit } from "../../shared/authEvents.ts";

// Phase 08 — Scenario CRUD. Admin-only. Adjustments stored as JSON string.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const S = base44.asServiceRole.entities;

    if (body.action === "list") {
      const list = await S.Scenario.filter({ organisation_id: actor.orgId }, "-created_date", 200);
      return Response.json({ scenarios: list.map(parseScenario) });
    }

    if (body.action === "create") {
      const rec = await S.Scenario.create({
        organisation_id: actor.orgId, site_id: body.site_id || null,
        name: body.name || "Untitled scenario", description: body.description || "",
        status: body.status || "draft", adjustments: JSON.stringify(body.adjustments || []),
        baseline_period_start: body.baseline_period_start || null, baseline_period_end: body.baseline_period_end || null,
        horizon_months: Number(body.horizon_months) || 12, color: body.color || "amber",
      });
      await writeAudit(base44, { orgId: actor.orgId, actionType: "create", entityType: "Scenario", entityId: rec.id, actorUserId: actor.actorUserId, afterState: rec.adjustments, reason: "scenario created" });
      return Response.json({ scenario: parseScenario(rec) });
    }

    if (body.action === "update" && body.scenario_id) {
      const update = {};
      for (const f of ["name", "description", "status", "color", "baseline_period_start", "baseline_period_end"]) if (body[f] !== undefined) update[f] = body[f];
      if (body.horizon_months != null) update.horizon_months = Number(body.horizon_months);
      if (body.adjustments !== undefined) update.adjustments = JSON.stringify(body.adjustments);
      const rec = await S.Scenario.update(body.scenario_id, update);
      await writeAudit(base44, { orgId: actor.orgId, actionType: "update", entityType: "Scenario", entityId: body.scenario_id, actorUserId: actor.actorUserId, afterState: rec.adjustments, reason: "scenario updated" });
      return Response.json({ scenario: parseScenario(rec) });
    }

    if (body.action === "delete" && body.scenario_id) {
      await S.Scenario.delete(body.scenario_id);
      await S.ForecastResult.deleteMany({ scenario_id: body.scenario_id }).catch(() => {});
      await writeAudit(base44, { orgId: actor.orgId, actionType: "delete", entityType: "Scenario", entityId: body.scenario_id, actorUserId: actor.actorUserId, reason: "scenario deleted" });
      return Response.json({ deleted: true, scenario_id: body.scenario_id });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function parseScenario(s) {
  let adj = [];
  try { adj = JSON.parse(s.adjustments || "[]"); } catch {}
  return { ...s, adjustments: adj };
}