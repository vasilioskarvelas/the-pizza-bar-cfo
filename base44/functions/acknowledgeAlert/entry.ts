import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, writeAudit } from "../../shared/authEvents.ts";

// Phase 07 — acknowledgeAlert: acknowledge and/or resolve an ExecutiveAlert.
// body: { alert_id, action: "acknowledge"|"resolve"|"reopen", note? }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!body.alert_id) return Response.json({ error: "alert_id required" }, { status: 400 });

    const S = base44.asServiceRole.entities;
    const alert = await S.ExecutiveAlert.get(body.alert_id);
    if (!alert || alert.organisation_id !== actor.orgId) return Response.json({ error: "Alert not found" }, { status: 404 });

    const now = new Date().toISOString();
    let update = {};
    if (body.action === "acknowledge") {
      update = { acknowledged: true, acknowledged_by: actor.actorUserId, acknowledged_at: now, status: alert.resolved ? "resolved" : "acknowledged" };
    } else if (body.action === "resolve") {
      update = { acknowledged: true, acknowledged_by: actor.actorUserId, acknowledged_at: alert.acknowledged_at || now, resolved: true, resolved_by: actor.actorUserId, resolved_at: now, resolution_note: body.note || "Resolved by user.", status: "resolved" };
    } else if (body.action === "dismiss") {
      update = { resolved: true, resolved_by: actor.actorUserId, resolved_at: now, status: "dismissed", resolution_note: body.note || "Dismissed." };
    } else if (body.action === "reopen") {
      update = { acknowledged: false, acknowledged_at: null, resolved: false, resolved_at: null, status: "open", resolution_note: null };
    } else {
      return Response.json({ error: "action must be acknowledge|resolve|dismiss|reopen" }, { status: 400 });
    }
    await S.ExecutiveAlert.update(alert.id, update);
    await writeAudit(base44, { orgId: actor.orgId, actionType: body.action, entityType: "ExecutiveAlert", entityId: alert.id, actorUserId: actor.actorUserId, actorRole: "admin", reason: `Alert ${body.action}: ${alert.title}` });
    const updated = await S.ExecutiveAlert.get(alert.id);
    return Response.json({ alert: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});