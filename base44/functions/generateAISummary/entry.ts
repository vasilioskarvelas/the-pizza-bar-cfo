import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, publishEvent, writeAudit, now, today } from "../../shared/authEvents.ts";
import { loadMetrics } from "../../shared/executivePlanningRunner.ts";
import { getCurrentOwnerScore } from "../../shared/ownerScoreRunner.ts";
import {
  AI_SUMMARY_ENGINE_VERSION, AI_SUMMARY_SCHEMA,
  buildContext, validateNumbers, deterministicFallback, summaryKey,
} from "../../shared/aiSummaryEngine.ts";
import { loadWeeklyActivity, loadOrgName, loadSiteName, currentWeekRange } from "../../shared/weeklyActivity.ts";

// Phase 11 — generateAISummary: permission-filtered context → InvokeLLM (fixed
// schema) → numeric validation → persist. Falls back to deterministic summary
// if the AI errors or quotes numbers not in the source set.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const S = base44.asServiceRole.entities;

    const orgId = actor.orgId;
    const siteId = body.site_id || null; // permission-filtered: non-admins restricted by RLS + actor site_ids
    const orgName = await loadOrgName(base44, orgId);
    const siteName = siteId ? await loadSiteName(base44, siteId) : null;

    // Curated context — only what the user may see.
    const { metrics, periodStart, periodEnd } = await loadMetrics(base44, { orgId, siteId });
    let ownerScore: number | null = null;
    try {
      const os = await getCurrentOwnerScore(base44, { orgId, siteId, periodStart, periodEnd });
      if (os?.score?.value != null) ownerScore = Number(os.score.value);
    } catch {}

    // Activity this week (shared loader, permission-scoped).
    const ws = currentWeekRange();
    const act = await loadWeeklyActivity(base44, { orgId, siteId, weekStart: ws.weekStart, weekEnd: ws.weekEnd });
    const { activity, topAlerts } = act;

    const ctx = buildContext({ orgName, siteName, scope: siteId ? "site" : "organisation", metrics, ownerScore, activity, alerts: topAlerts, period: { start: periodStart, end: periodEnd } });
    const key = summaryKey(orgId, siteId, ctx.contextHash);

    // Idempotent: return existing unless force.
    if (!body.force) {
      const existing = await S.AISummary.filter({ organisation_id: orgId, summary_key: key });
      if (existing.length) return Response.json({ summary_id: existing[0].id, reused: true, payload: JSON.parse(existing[0].payload), validation_status: existing[0].validation_status, engine_version: AI_SUMMARY_ENGINE_VERSION });
    }

    // Invoke LLM with the fixed schema (default model to conserve credits).
    let aiPayload: any = null;
    let model = "automatic";
    let invokeError: string | null = null;
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: ctx.promptContext,
        response_json_schema: AI_SUMMARY_SCHEMA,
      });
      // InvokeLLM returns a dict when schema is set.
      aiPayload = res && (res as any);
      if (typeof aiPayload === "string") aiPayload = JSON.parse(aiPayload);
    } catch (e) { invokeError = e.message; }

    // Validate the AI's quoted numbers against the source set.
    const aiText = aiPayload ? JSON.stringify(aiPayload) : "";
    const validation = validateNumbers(aiText, ctx.allowed);

    let payload: any;
    let usedFallback = false;
    let validationStatus = validation.status;
    if (!aiPayload || invokeError) {
      payload = deterministicFallback({ metrics, ownerScore, activity, period: { start: periodStart, end: periodEnd } });
      usedFallback = true; validationStatus = "fallback";
    } else if (validation.status === "failed") {
      // Hallucinated figures detected — fall back but keep the AI structure's
      // non-numeric content where safe.
      payload = deterministicFallback({ metrics, ownerScore, activity, period: { start: periodStart, end: periodEnd } });
      usedFallback = true; validationStatus = "failed";
    } else {
      payload = aiPayload;
    }

    const common = {
      payload: JSON.stringify(payload),
      headline: payload.headline || "",
      outlook: payload.outlook || "cautious",
      confidence: payload.confidence || "medium",
      validation_status: validationStatus,
      validation_mismatches: JSON.stringify(validation.mismatches),
      used_fallback: usedFallback,
      model, prompt_context: ctx.promptContext, context_hash: ctx.contextHash,
      scope: siteId ? "site" : "organisation",
      period_start: periodStart, period_end: periodEnd,
      owner_score: ownerScore ?? null,
      generated_at: now(), engine_version: AI_SUMMARY_ENGINE_VERSION,
    };

    const existing = await S.AISummary.filter({ organisation_id: orgId, summary_key: key });
    let rec;
    if (existing.length) rec = await S.AISummary.update(existing[0].id, { ...common, delivered_via_email: undefined });
    else rec = await S.AISummary.create({ organisation_id: orgId, site_id: siteId, summary_key: key, ...common });

    await publishEvent(base44, { orgId, siteId, eventKey: "ai_summary.generated", entityType: "AISummary", entityId: rec.id, message: `AI summary generated (${validationStatus}${usedFallback ? ", fallback" : ""})`, actorUserId: actor.actorUserId, details: JSON.stringify({ validation: validationStatus, mismatches: validation.mismatches }) });
    await writeAudit(base44, { orgId, siteId, actionType: "create", entityType: "AISummary", entityId: rec.id, actorUserId: actor.actorUserId, afterState: common.headline, reason: "ai summary generated" });

    return Response.json({ summary_id: rec.id, validation_status: validationStatus, used_fallback: usedFallback, mismatches: validation.mismatches, payload, engine_version: AI_SUMMARY_ENGINE_VERSION });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});