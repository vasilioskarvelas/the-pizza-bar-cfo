import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";

// Phase 07 — getDashboardWidgets: read + save per-user widget personalisation
// (visibility, collapsed, favourite, order). body: { action: "read"|"save", widgets?: [{widget_key,visible,collapsed,favourite,sort_order}] }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const S = base44.asServiceRole.entities;
    const existing = await S.DashboardWidget.filter({ organisation_id: actor.orgId, user_id: actor.actorUserId });

    if (body.action === "save" && Array.isArray(body.widgets)) {
      for (const w of body.widgets) {
        const prev = existing.find((e) => e.widget_key === w.widget_key);
        const data = { organisation_id: actor.orgId, user_id: actor.actorUserId, widget_key: w.widget_key, visible: w.visible !== false, collapsed: !!w.collapsed, favourite: !!w.favourite, sort_order: w.sort_order || 0 };
        if (prev) await S.DashboardWidget.update(prev.id, data);
        else await S.DashboardWidget.create(data);
      }
      const refreshed = await S.DashboardWidget.filter({ organisation_id: actor.orgId, user_id: actor.actorUserId });
      return Response.json({ widgets: refreshed });
    }

    return Response.json({ widgets: existing });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});