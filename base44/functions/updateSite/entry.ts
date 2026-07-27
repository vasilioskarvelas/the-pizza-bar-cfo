import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { writeAudit, publishEvent } from "../../shared/authEvents.ts";

// Phase 13 — updateSite (platform admin, or org admin within own org).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
    const before = await base44.asServiceRole.entities.Site.get(body.id);
    if (!before) return Response.json({ error: "site not found" }, { status: 404 });
    if (!actor.isPlatformAdmin && before.organisation_id !== actor.orgId) return Response.json({ error: "Forbidden: cross-organisation update denied" }, { status: 403 });
    const patch: any = {};
    for (const k of ["name","suburb","address","state","postcode","country","abn","contact_phone","contact_email","manager_user_ids","cost_centre_id","timezone","trading_hours","default_reporting_rules","business_day_boundary","status","opening_date","floor_area_sqm","trading_days_per_week"]) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    const after = await base44.asServiceRole.entities.Site.update(body.id, patch);
    await publishEvent(base44, { orgId: before.organisation_id, siteId: body.id, eventKey: "enterprise.site.updated", entityType: "Site", entityId: body.id, message: `Site updated: ${after?.name || before.name}`, actorUserId: actor.actorUserId });
    await writeAudit(base44, { orgId: before.organisation_id, siteId: body.id, actionType: "update", entityType: "Site", entityId: body.id, actorUserId: actor.actorUserId, beforeState: JSON.stringify({ name: before.name, status: before.status }), afterState: JSON.stringify(patch), reason: "enterprise site update" });
    return Response.json({ site: { id: body.id, name: after?.name, status: after?.status } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});