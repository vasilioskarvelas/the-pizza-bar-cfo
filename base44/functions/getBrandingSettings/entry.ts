import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";

// Phase 13 — getBrandingSettings: white-labelling config for the actor's org
// (platform admin may pass organisation_id; defaults are returned if none set).

const DEFAULTS = { logo_url: null, primary_color: "#0f172a", accent_color: "#f59e0b", report_header: null, email_footer: null, login_bg_url: null, enabled: true };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin && !actor.orgId) return Response.json({ error: "Forbidden" }, { status: 403 });
    const orgId = body.organisation_id || actor.orgId;
    if (!orgId) return Response.json({ error: "organisation_id required" }, { status: 400 });
    if (!actor.isPlatformAdmin && orgId !== actor.orgId) return Response.json({ error: "Forbidden: cross-organisation read denied" }, { status: 403 });
    const recs = await base44.asServiceRole.entities.BrandingSetting.filter({ organisation_id: orgId });
    const rec = recs[0];
    return Response.json({ branding: { organisation_id: orgId, ...(rec ? { id: rec.id, logo_url: rec.logo_url, primary_color: rec.primary_color, accent_color: rec.accent_color, report_header: rec.report_header, email_footer: rec.email_footer, login_bg_url: rec.login_bg_url, enabled: rec.enabled } : DEFAULTS) } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});