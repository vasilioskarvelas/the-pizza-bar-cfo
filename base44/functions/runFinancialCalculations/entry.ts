import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";
import { runEngine } from "../../shared/financialRunner.ts";

// Phase 05 — runFinancialCalculations: manual trigger of the deterministic
// financial & tax engine for a scope (org, optional site) and period. Admin-only
// (or scheduled platform call). Cache reuse + supersession + full lineage.
// No AI. All writes via service role.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });

    const periodStart = body.period_start;
    const periodEnd = body.period_end;
    if (!periodStart || !periodEnd) return Response.json({ error: "period_start and period_end required" }, { status: 400 });

    const res = await runEngine(base44, {
      orgId: actor.orgId, siteId: body.site_id || null,
      periodStart, periodEnd, actorUserId: actor.actorUserId, triggeredBy: body.trigger || "manual",
      force: !!body.force,
    });
    return Response.json(res);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});