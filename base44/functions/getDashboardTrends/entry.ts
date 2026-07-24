import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { buildTrends, KPI_CARDS } from "../../shared/dashboardShared.ts";

// Phase 07 — getDashboardTrends: trend series for a metric code across available periods.
// body: { code, range_days?, site_id? }  range_days: 7|30|90|365

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const code = body.code || "revenue";
    const trends = await buildTrends(base44.asServiceRole.entities, actor.orgId, body.site_id || null, code, body.range_days || null);
    return Response.json({ ...trends, available_codes: KPI_CARDS.map((c) => c.code) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});