import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveActor, publishEvent, writeAudit } from "../../shared/authEvents.ts";
import { validateOwnerScoreMethodology } from "../../shared/ownerScoreRunner.ts";

// Phase 06 — validateOwnerScoreMethodology: validate the active (or specified)
// methodology version — weights total 100%, active components have valid inputs,
// inputs reference existing KPIs, threshold ranges do not overlap/gap, effective
// dates valid. Publishes owner_score.methodology.invalid on failure. Admin-only.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const actor = await resolveActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.forbidden) return Response.json({ error: "Forbidden" }, { status: 403 });
    const res = await validateOwnerScoreMethodology(base44, { orgId: actor.orgId, methodologyVersionId: body.methodology_version_id || null });
    await writeAudit(base44, { orgId: actor.orgId, actionType: "read_sensitive", entityType: "ScoreMethodologyVersion", entityId: res.methodology_version?.id, actorUserId: actor.actorUserId, afterState: JSON.stringify({ valid: res.valid, errors: res.errors }), reason: "methodology validation" });
    if (!res.valid) {
      await publishEvent(base44, { orgId: actor.orgId, eventKey: "owner_score.methodology.invalid", entityType: "ScoreMethodologyVersion", entityId: res.methodology_version?.id, message: `Methodology invalid: ${res.errors.join("; ")}`, severity: "critical", actorUserId: actor.actorUserId });
    }
    return Response.json(res);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});