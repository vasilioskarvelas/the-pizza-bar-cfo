import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { writeAudit, publishEvent } from "../../shared/authEvents.ts";

// Phase 13 — updateOrganisation (platform admin only).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin) return Response.json({ error: "Forbidden: platform admin only" }, { status: 403 });
    if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
    const before = await base44.asServiceRole.entities.Organisation.get(body.id);
    if (!before) return Response.json({ error: "organisation not found" }, { status: 404 });
    const patch: any = {};
    for (const k of ["name","legal_name","trading_name","abn","parent_id","organisation_type","industry","status","gst_method","default_currency","timezone","financial_year_start_month","logo_url","branding","tax_settings","settings"]) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    const after = await base44.asServiceRole.entities.Organisation.update(body.id, patch);
    await publishEvent(base44, { orgId: body.id, eventKey: "enterprise.org.updated", entityType: "Organisation", entityId: body.id, message: `Organisation updated: ${after?.name || before.name}`, actorUserId: actor.actorUserId });
    await writeAudit(base44, { orgId: body.id, actionType: "update", entityType: "Organisation", entityId: body.id, actorUserId: actor.actorUserId, actorRole: "platform_admin", beforeState: JSON.stringify({ name: before.name, status: before.status, type: before.organisation_type }), afterState: JSON.stringify(patch), reason: "enterprise org update" });
    return Response.json({ organisation: { id: body.id, name: after?.name, status: after?.status } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});