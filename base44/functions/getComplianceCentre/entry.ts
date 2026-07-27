import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { complianceStatus, COMPLIANCE_TYPE_LABELS, ENTERPRISE_ENGINE_VERSION } from "../../shared/enterpriseEngine.ts";

// Phase 13 — getComplianceCentre: list compliance items for the actor's scope,
// each annotated with the derived status (overdue / due_soon / upcoming / filed).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin && !actor.orgId) return Response.json({ error: "Forbidden" }, { status: 403 });
    const filter = actor.isPlatformAdmin && body.organisation_id
      ? { organisation_id: body.organisation_id }
      : actor.isPlatformAdmin ? {} : { organisation_id: actor.orgId };
    const siteId = body.site_id || null;
    const items = await base44.asServiceRole.entities.ComplianceItem.filter(filter, "due_date", 500);
    const scoped = items.filter((c: any) => (siteId ? c.site_id === siteId : true));
    const annotated = scoped.map((c: any) => ({
      id: c.id, organisation_id: c.organisation_id, site_id: c.site_id,
      compliance_type: c.compliance_type, type_label: COMPLIANCE_TYPE_LABELS[c.compliance_type] || c.compliance_type,
      title: c.title, reference: c.reference, due_date: c.due_date, amount_cents: c.amount_cents,
      status: complianceStatus(c.due_date, c.status, c.reminder_days),
      recorded_status: c.status, responsible_owner_user_id: c.responsible_owner_user_id,
      evidence_doc_id: c.evidence_doc_id, notes: c.notes, reminder_days: c.reminder_days,
      recurrence: c.recurrence, last_reminder_at: c.last_reminder_at, completed_at: c.completed_at,
    }));
    const summary = {
      total: annotated.length,
      overdue: annotated.filter((c: any) => c.status === "overdue").length,
      due_soon: annotated.filter((c: any) => c.status === "due_soon").length,
      upcoming: annotated.filter((c: any) => c.status === "upcoming").length,
      filed: annotated.filter((c: any) => ["filed","paid","done","waived"].includes(c.status)).length,
    };
    return Response.json({ engine_version: ENTERPRISE_ENGINE_VERSION, summary, items: annotated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});