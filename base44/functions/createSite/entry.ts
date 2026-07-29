import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { writeAudit, publishEvent } from "../../shared/authEvents.ts";

// Phase 13 — createSite (platform admin, or org admin within own org).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    // M2 + 4.5: creating a site is an org-wide/admin action. Only an organisation
    // admin (owner/system) or platform admin may create — not any org member. The
    // cross-organisation guard below still confines org admins to their own org.
    if (!actor.isOrganisationAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!body.name) return Response.json({ error: "name required" }, { status: 400 });
    const orgId = body.organisation_id || (actor.isPlatformAdmin ? null : actor.orgId);
    if (!orgId) return Response.json({ error: "organisation_id required" }, { status: 400 });
    if (!actor.isPlatformAdmin && orgId !== actor.orgId) return Response.json({ error: "Forbidden: cross-organisation site creation denied" }, { status: 403 });
    const site = await base44.asServiceRole.entities.Site.create({
      organisation_id: orgId, name: body.name, suburb: body.suburb || null, address: body.address || null,
      state: body.state || null, postcode: body.postcode || null, country: body.country || "AU", abn: body.abn || null,
      contact_phone: body.contact_phone || null, contact_email: body.contact_email || null,
      manager_user_ids: body.manager_user_ids || null, cost_centre_id: body.cost_centre_id || null,
      timezone: body.timezone || "Australia/Melbourne", trading_hours: body.trading_hours || null,
      default_reporting_rules: body.default_reporting_rules || null, business_day_boundary: body.business_day_boundary || "04:00",
      status: body.status || "active", opening_date: body.opening_date || null, floor_area_sqm: body.floor_area_sqm || null,
      trading_days_per_week: body.trading_days_per_week ?? 7,
    });
    await publishEvent(base44, { orgId, siteId: site.id, eventKey: "enterprise.site.created", entityType: "Site", entityId: site.id, message: `Site created: ${body.name}`, actorUserId: actor.actorUserId });
    await writeAudit(base44, { orgId, siteId: site.id, actionType: "create", entityType: "Site", entityId: site.id, actorUserId: actor.actorUserId, afterState: JSON.stringify({ name: body.name }), reason: "enterprise site creation" });
    return Response.json({ site: { id: site.id, organisation_id: orgId, name: site.name, status: site.status, created_date: site.created_date } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});