import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { writeAudit, publishEvent, now, assertSiteInOrg } from "../../shared/authEvents.ts";

// Phase 13 — updateComplianceItem (status, filing, reminders). Cross-org denied.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
    const before = await base44.asServiceRole.entities.ComplianceItem.get(body.id);
    if (!before) return Response.json({ error: "compliance item not found" }, { status: 404 });
    if (!actor.isPlatformAdmin && before.organisation_id !== actor.orgId) return Response.json({ error: "Forbidden: cross-organisation update denied" }, { status: 403 });
    if (body.site_id !== undefined && body.site_id !== null) {
      const siteCheck = await assertSiteInOrg(base44, body.site_id, before.organisation_id);
      if (!siteCheck.ok) return Response.json({ error: siteCheck.error }, { status: siteCheck.status });
    }
    const patch: any = {};
    for (const k of ["site_id","compliance_type","title","reference","due_date","amount_cents","status","responsible_owner_user_id","evidence_doc_id","notes","reminder_days","recurrence","last_reminder_at"]) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (["filed","paid","done","waived"].includes(body.status) && !before.completed_at) patch.completed_at = now();
    const after = await base44.asServiceRole.entities.ComplianceItem.update(body.id, patch);
    await publishEvent(base44, { orgId: before.organisation_id, siteId: before.site_id, eventKey: "enterprise.compliance.updated", entityType: "ComplianceItem", entityId: body.id, message: `Compliance updated: ${after?.title || before.title} → ${body.status || before.status}`, actorUserId: actor.actorUserId });
    await writeAudit(base44, { orgId: before.organisation_id, siteId: before.site_id, actionType: "update", entityType: "ComplianceItem", entityId: body.id, actorUserId: actor.actorUserId, beforeState: JSON.stringify({ status: before.status, due_date: before.due_date }), afterState: JSON.stringify(patch), reason: "compliance update" });
    return Response.json({ compliance_item: { id: body.id, status: after?.status, completed_at: after?.completed_at } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});