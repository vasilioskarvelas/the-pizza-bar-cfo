import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, today } from "../../shared/authEvents.ts";
import { runEngine } from "../../shared/financialRunner.ts";

// Phase 05 — runScheduledCalculations: platform-invoked (workflow) daily
// financial calculation. Loops every active site for the current period, then
// runs an organisation-consolidated pass. No user auth; orgId required.

function currentMonthBounds() {
  const t = today(); // YYYY-MM-DD
  const [y, m] = t.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day of month
  return [start, end];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const [periodStart, periodEnd] = body.period_start && body.period_end ? [body.period_start, body.period_end] : currentMonthBounds();
    const S = base44.asServiceRole.entities;
    const sites = await S.Site.filter({ organisation_id: actor.orgId, status: "active" });
    const runs = [];
    for (const site of sites) {
      try {
        const r = await runEngine(base44, { orgId: actor.orgId, siteId: site.id, periodStart, periodEnd, actorUserId: "system", triggeredBy: "scheduled" });
        runs.push({ site: site.name, ...r });
      } catch (e) { runs.push({ site: site.name, error: e.message }); }
    }
    const orgRun = await runEngine(base44, { orgId: actor.orgId, siteId: null, periodStart, periodEnd, actorUserId: "system", triggeredBy: "scheduled_org" });
    return Response.json({ period: { start: periodStart, end: periodEnd }, site_runs: runs, org_run: orgRun });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});