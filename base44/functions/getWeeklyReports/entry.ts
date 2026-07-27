import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";

// Phase 10 — getWeeklyReports: list persisted weekly reports (history browser).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const siteId = body.site_id || null;
    const recs = await base44.asServiceRole.entities.WeeklyReport.filter({ organisation_id: actor.orgId }, "-week_start", 100);
    const scoped = recs.filter((r: any) => (siteId ? r.site_id === siteId : true));
    return Response.json({
      reports: scoped.map((r: any) => ({
        id: r.id, site_id: r.site_id, week_start: r.week_start, week_end: r.week_end,
        summary_text: r.summary_text, owner_score: r.owner_score, revenue: r.revenue,
        net_profit: r.net_profit, cash: r.cash, alerts_count: r.alerts_count,
        goals_updated: r.goals_updated, initiatives_updated: r.initiatives_updated,
        decisions_count: r.decisions_count, status: r.status,
        delivered_via_email: r.delivered_via_email, generated_at: r.generated_at,
        engine_version: r.engine_version, payload: r.payload,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});