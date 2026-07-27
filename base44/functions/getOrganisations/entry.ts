import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";

// Phase 13 — getOrganisations: platform admin sees all; org admin sees own.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin && !actor.orgId) return Response.json({ error: "Forbidden" }, { status: 403 });
    // Bounded reads (limit 1000) — unbounded .list() truncates at the SDK default cap.
    const all = await base44.asServiceRole.entities.Organisation.filter({}, "-created_date", 1000);
    const scoped = actor.isPlatformAdmin ? all : all.filter((o: any) => o.id === actor.orgId);
    const sites = await base44.asServiceRole.entities.Site.filter({}, "-created_date", 1000);
    const siteCount: Record<string, number> = {};
    for (const s of sites) siteCount[s.organisation_id] = (siteCount[s.organisation_id] || 0) + 1;
    return Response.json({
      organisations: scoped.map((o: any) => ({
        id: o.id, name: o.name, legal_name: o.legal_name, trading_name: o.trading_name,
        abn: o.abn, parent_id: o.parent_id, organisation_type: o.organisation_type,
        industry: o.industry, status: o.status, gst_method: o.gst_method,
        default_currency: o.default_currency, timezone: o.timezone,
        financial_year_start_month: o.financial_year_start_month, logo_url: o.logo_url,
        site_count: siteCount[o.id] || 0, created_date: o.created_date,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});