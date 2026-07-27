import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";

// Phase 13 — getSites: platform admin sees all (or by organisation_id); org admin sees own org sites.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin && !actor.orgId) return Response.json({ error: "Forbidden" }, { status: 403 });
    const orgFilter = body.organisation_id ? { organisation_id: body.organisation_id } : {};
    const sites = await base44.asServiceRole.entities.Site.filter(orgFilter, "-created_date", 500);
    let scoped = sites;
    if (!actor.isPlatformAdmin) {
      const siteIds: string[] = (actor.user && (actor.user.data || {}).site_ids) || [];
      scoped = sites.filter((s: any) => s.organisation_id === actor.orgId && (siteIds.length === 0 || siteIds.includes(s.id)));
    }
    return Response.json({
      sites: scoped.map((s: any) => ({
        id: s.id, organisation_id: s.organisation_id, name: s.name, suburb: s.suburb, address: s.address,
        state: s.state, postcode: s.postcode, country: s.country, abn: s.abn,
        contact_phone: s.contact_phone, contact_email: s.contact_email, manager_user_ids: s.manager_user_ids,
        cost_centre_id: s.cost_centre_id, timezone: s.timezone, trading_hours: s.trading_hours,
        default_reporting_rules: s.default_reporting_rules, status: s.status, opening_date: s.opening_date,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});