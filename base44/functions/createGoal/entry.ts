import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { listGoals, createGoal, updateGoal, deleteGoal } from "../../shared/executivePlanningRunner.ts";

// Phase 09 — Goal CRUD (action-based). Admin or owner.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    if (body.action === "list") {
      const goals = await listGoals(base44, { orgId: actor.orgId, siteId: body.site_id || null });
      return Response.json({ goals, count: goals.length });
    }
    if (body.action === "create") {
      const rec = await createGoal(base44, { orgId: actor.orgId, siteId: body.site_id || null, body, actorUserId: actor.actorUserId });
      return Response.json({ goal: rec });
    }
    if (body.action === "update" && body.goal_id) {
      const rec = await updateGoal(base44, { orgId: actor.orgId, body, actorUserId: actor.actorUserId });
      return Response.json({ goal: rec });
    }
    if (body.action === "delete" && body.goal_id) {
      const res = await deleteGoal(base44, { orgId: actor.orgId, body, actorUserId: actor.actorUserId });
      return Response.json(res);
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});