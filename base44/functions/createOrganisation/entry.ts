import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { writeAudit, publishEvent, now } from "../../shared/authEvents.ts";

// Phase 13 — createOrganisation (platform admin only). Seeds default branding.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin) return Response.json({ error: "Forbidden: platform admin only" }, { status: 403 });
    if (!body.name) return Response.json({ error: "name required" }, { status: 400 });
    const org = await base44.asServiceRole.entities.Organisation.create({
      name: body.name, legal_name: body.legal_name || null, trading_name: body.trading_name || null,
      abn: body.abn || null, parent_id: body.parent_id || null,
      organisation_type: body.organisation_type || "independent", industry: body.industry || null,
      status: body.status || "active", gst_method: body.gst_method || "accrual",
      default_currency: body.default_currency || "AUD", timezone: body.timezone || "Australia/Melbourne",
      financial_year_start_month: body.financial_year_start_month ?? 7, data_residency: "AU",
      logo_url: body.logo_url || null, branding: body.branding || null, tax_settings: body.tax_settings || null, settings: body.settings || null,
    });
    await base44.asServiceRole.entities.BrandingSetting.create({ organisation_id: org.id, enabled: true });
    await publishEvent(base44, { orgId: org.id, eventKey: "enterprise.org.created", entityType: "Organisation", entityId: org.id, message: `Organisation created: ${body.name}`, actorUserId: actor.actorUserId });
    await writeAudit(base44, { orgId: org.id, actionType: "create", entityType: "Organisation", entityId: org.id, actorUserId: actor.actorUserId, actorRole: "platform_admin", afterState: JSON.stringify({ name: body.name, type: org.organisation_type }), reason: "enterprise org creation" });
    return Response.json({ organisation: { id: org.id, name: org.name, status: org.status, created_date: org.created_date } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});