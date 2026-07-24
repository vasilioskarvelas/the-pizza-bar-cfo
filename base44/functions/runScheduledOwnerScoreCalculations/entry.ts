import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { runOwnerScore } from "../../shared/ownerScoreRunner.ts";

// Phase 06 — runScheduledOwnerScoreCalculations: scheduled/platform invocation
// that computes the Owner Score for every active site plus the organisation-
// consolidated pass for a period. No AI.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const { period_start, period_end } = body;
    if (!period_start || !period_end) return Response.json({ error: "period_start and period_end required" }, { status: 400 });

    const S = base44.asServiceRole.entities;
    const sites = await S.Site.filter({ organisation_id: actor.orgId });
    const siteRuns = [];
    for (const site of sites) {
      const r = await runOwnerScore(base44, { orgId: actor.orgId, siteId: site.id, periodStart: period_start, periodEnd: period_end, actorUserId: actor.actorUserId, triggeredBy: body.trigger || "scheduled" });
      siteRuns.push({ site: site.name, ...r });
    }
    const orgRun = await runOwnerScore(base44, { orgId: actor.orgId, siteId: null, periodStart: period_start, periodEnd: period_end, actorUserId: actor.actorUserId, triggeredBy: body.trigger || "scheduled" });
    return Response.json({ period: { start: period_start, end: period_end }, site_runs: siteRuns, org_run: orgRun });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});