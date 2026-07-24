import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";

// Phase 07 — dismissNotification: mark a Notification read / dismissed / archived.
// body: { notification_id, action: "read"|"dismiss"|"archive" }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!body.notification_id) return Response.json({ error: "notification_id required" }, { status: 400 });

    const S = base44.asServiceRole.entities;
    const n = await S.Notification.get(body.notification_id);
    if (!n || n.organisation_id !== actor.orgId) return Response.json({ error: "Notification not found" }, { status: 404 });

    const status = body.action === "read" ? "read" : body.action === "dismiss" ? "dismissed" : body.action === "archive" ? "archived" : null;
    if (!status) return Response.json({ error: "action must be read|dismiss|archive" }, { status: 400 });
    await S.Notification.update(n.id, { status });
    return Response.json({ notification_id: n.id, status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});