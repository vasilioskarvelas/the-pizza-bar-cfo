import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, assertOwnership, assertSiteInOrg } from "../../shared/authEvents.ts";
import { listDecisions, createDecision, updateDecision } from "../../shared/executivePlanningRunner.ts";

// Phase 09 — Decision CRUD (action-based). Variance auto-computed.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    if (body.action === "list") {
      const decisions = await listDecisions(base44, { orgId: actor.orgId, siteId: body.site_id || null });
      return Response.json({ decisions, count: decisions.length });
    }
    if (body.action === "create") {
      const siteCheck = await assertSiteInOrg(base44, body.site_id, actor.orgId);
      if (!siteCheck.ok) return Response.json({ error: siteCheck.error }, { status: siteCheck.status });
      const rec = await createDecision(base44, { orgId: actor.orgId, siteId: body.site_id || null, body, actorUserId: actor.actorUserId });
      return Response.json({ decision: rec });
    }
    if (body.action === "update" && body.decision_id) {
      const g = await assertOwnership(base44, "ExecutiveDecision", body.decision_id, actor);
      if (!g.ok) return Response.json({ error: g.error }, { status: g.status });
      const rec = await updateDecision(base44, { orgId: actor.orgId, body, actorUserId: actor.actorUserId });
      return Response.json({ decision: rec });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});