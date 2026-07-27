import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor } from "../../shared/authEvents.ts";

// Phase 11 — getAISummaries: list persisted AI summaries (history browser).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const siteId = body.site_id || null;
    const recs = await base44.asServiceRole.entities.AISummary.filter({ organisation_id: actor.orgId }, "-generated_at", 50);
    const scoped = recs.filter((r: any) => (siteId ? r.site_id === siteId : true));
    return Response.json({
      summaries: scoped.map((r: any) => ({
        id: r.id, site_id: r.site_id, scope: r.scope, headline: r.headline,
        outlook: r.outlook, confidence: r.confidence,
        validation_status: r.validation_status, used_fallback: r.used_fallback,
        owner_score: r.owner_score, period_start: r.period_start, period_end: r.period_end,
        generated_at: r.generated_at, model: r.model, engine_version: r.engine_version,
        payload: r.payload,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});