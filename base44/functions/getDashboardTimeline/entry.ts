import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { buildTimeline } from "../../shared/dashboardShared.ts";

// Phase 07 — getDashboardTimeline: unified activity timeline (imports, reconciliations,
// financial & owner-score calculations, alerts, methodology/config changes, audit events).
// body: { site_id?, filter?, limit? }  filter: connector|reconciliation|calculation|owner_score|methodology|configuration|audit|alert

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const items = await buildTimeline(base44.asServiceRole.entities, actor.orgId, body.site_id || null, body.limit || 100, body.filter || null);
    return Response.json({ count: items.length, items, filter: body.filter || null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});