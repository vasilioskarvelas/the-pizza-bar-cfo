import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { getCurrentResults } from "../../shared/financialRunner.ts";

// Phase 05 — getCurrentFinancialResults: read current (non-superseded)
// financial/KPI/tax results for a scope + period, with run metadata. Admin-only.
// Optionally include superseded history.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const res = await getCurrentResults(base44, {
      orgId: actor.orgId,
      siteId: body.site_id || null,
      periodStart: body.period_start || null,
      periodEnd: body.period_end || null,
      includeSuperseded: !!body.include_superseded,
    });
    return Response.json({ count: res.length, results: res });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});