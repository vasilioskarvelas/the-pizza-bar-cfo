import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { writeAudit, publishEvent } from "../../shared/authEvents.ts";

// Phase 13 — deleteSite (platform admin, or org admin within own org). Safeguard:
// refuse if the site has open compliance items or active documents unless force=true.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
    const before = await base44.asServiceRole.entities.Site.get(body.id);
    if (!before) return Response.json({ error: "site not found" }, { status: 404 });
    if (!actor.isPlatformAdmin && before.organisation_id !== actor.orgId) return Response.json({ error: "Forbidden: cross-organisation delete denied" }, { status: 403 });
    const [compliance, docs] = await Promise.all([
      base44.asServiceRole.entities.ComplianceItem.filter({ organisation_id: before.organisation_id, site_id: body.id }),
      base44.asServiceRole.entities.VaultDocument.filter({ organisation_id: before.organisation_id, site_id: body.id, status: "active" }),
    ]);
    const openCompliance = compliance.filter((c: any) => !["filed","paid","done","waived"].includes(c.status));
    const blocking = [];
    if (openCompliance.length) blocking.push(`${openCompliance.length} open compliance item(s)`);
    if (docs.length) blocking.push(`${docs.length} active document(s)`);
    if (blocking.length && !body.force) {
      return Response.json({ error: "Deletion blocked", blocking, id: body.id, hint: "Set force=true to close the site (data retained)." }, { status: 409 });
    }
    if (blocking.length) {
      const after = await base44.asServiceRole.entities.Site.update(body.id, { status: "closed" });
      await publishEvent(base44, { orgId: before.organisation_id, siteId: body.id, eventKey: "enterprise.site.closed", entityType: "Site", entityId: body.id, message: `Site closed: ${after?.name || before.name}`, actorUserId: actor.actorUserId });
      await writeAudit(base44, { orgId: before.organisation_id, siteId: body.id, actionType: "update", entityType: "Site", entityId: body.id, actorUserId: actor.actorUserId, afterState: "closed", reason: "delete safeguard: closed (blockers remain)" });
      return Response.json({ closed: true, id: body.id, blocking });
    }
    await base44.asServiceRole.entities.Site.delete(body.id);
    await publishEvent(base44, { orgId: before.organisation_id, siteId: body.id, eventKey: "enterprise.site.deleted", entityType: "Site", entityId: body.id, message: `Site deleted: ${before.name}`, actorUserId: actor.actorUserId });
    await writeAudit(base44, { orgId: before.organisation_id, siteId: body.id, actionType: "delete", entityType: "Site", entityId: body.id, actorUserId: actor.actorUserId, beforeState: JSON.stringify({ name: before.name, status: before.status }), reason: "enterprise site deletion (no blockers)" });
    return Response.json({ deleted: true, id: body.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});