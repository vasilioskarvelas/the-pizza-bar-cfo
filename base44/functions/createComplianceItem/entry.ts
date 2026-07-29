import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { writeAudit, publishEvent, assertSiteInOrg } from "../../shared/authEvents.ts";

// Phase 13 — createComplianceItem (platform admin or org admin within own org).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    // M2 + 4.5: creating a compliance item is an org-wide/admin action. Only an
    // organisation admin (owner/system) or platform admin may create — not any org
    // member. The cross-organisation guard below still confines org admins to own org.
    if (!actor.isOrganisationAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!body.compliance_type || !body.title || !body.due_date) return Response.json({ error: "compliance_type, title, due_date required" }, { status: 400 });
    const orgId = body.organisation_id || (actor.isPlatformAdmin ? null : actor.orgId);
    if (!orgId) return Response.json({ error: "organisation_id required" }, { status: 400 });
    if (!actor.isPlatformAdmin && orgId !== actor.orgId) return Response.json({ error: "Forbidden: cross-organisation create denied" }, { status: 403 });
    const siteCheck = await assertSiteInOrg(base44, body.site_id, orgId);
    if (!siteCheck.ok) return Response.json({ error: siteCheck.error }, { status: siteCheck.status });
    const item = await base44.asServiceRole.entities.ComplianceItem.create({
      organisation_id: orgId, site_id: body.site_id || null, compliance_type: body.compliance_type,
      title: body.title, reference: body.reference || null, due_date: body.due_date,
      amount_cents: body.amount_cents || 0, status: body.status || "upcoming",
      responsible_owner_user_id: body.responsible_owner_user_id || null, evidence_doc_id: body.evidence_doc_id || null,
      notes: body.notes || null, reminder_days: body.reminder_days ?? 7, recurrence: body.recurrence || "one_off",
    });
    await publishEvent(base44, { orgId, siteId: item.site_id, eventKey: "enterprise.compliance.created", entityType: "ComplianceItem", entityId: item.id, message: `Compliance item created: ${body.title}`, actorUserId: actor.actorUserId });
    await writeAudit(base44, { orgId, siteId: item.site_id, actionType: "create", entityType: "ComplianceItem", entityId: item.id, actorUserId: actor.actorUserId, afterState: JSON.stringify({ type: body.compliance_type, due_date: body.due_date }), reason: "compliance creation" });
    return Response.json({ compliance_item: { id: item.id, organisation_id: orgId, title: item.title, due_date: item.due_date } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});