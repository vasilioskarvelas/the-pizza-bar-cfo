import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { generateReport } from "../../shared/executivePlanningRunner.ts";

// Phase 09 — generateExecutiveReport: structured deterministic report (no AI).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const report = await generateReport(base44, { orgId: actor.orgId, siteId: body.site_id || null, periodStart: body.period_start, periodEnd: body.period_end, format: body.format || "full" });
    return Response.json(report);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});