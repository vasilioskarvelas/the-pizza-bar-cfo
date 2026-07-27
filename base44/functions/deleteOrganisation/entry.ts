import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { writeAudit, publishEvent } from "../../shared/authEvents.ts";

// Phase 13 — deleteOrganisation (platform admin). Safeguard: refuse if the org
// has active sites, provisioned users, or open compliance items unless force=true.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin) return Response.json({ error: "Forbidden: platform admin only" }, { status: 403 });
    if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
    const [sites, compliance, profiles] = await Promise.all([
      base44.asServiceRole.entities.Site.filter({ organisation_id: body.id }),
      base44.asServiceRole.entities.ComplianceItem.filter({ organisation_id: body.id }),
      base44.asServiceRole.entities.UserProfile.filter({ organisation_id: body.id }),
    ]);
    const activeSites = sites.filter((s: any) => s.status === "active");
    const activeUsers = profiles.filter((p: any) => p.status === "active");
    const openCompliance = compliance.filter((c: any) => !["filed","paid","done","waived"].includes(c.status));
    const blocking = [];
    if (activeSites.length) blocking.push(`${activeSites.length} active site(s)`);
    if (activeUsers.length) blocking.push(`${activeUsers.length} active user(s)`);
    if (openCompliance.length) blocking.push(`${openCompliance.length} open compliance item(s)`);
    if (blocking.length && !body.force) {
      return Response.json({ error: "Deletion blocked", blocking, hint: "Set force=true to suspend instead, after confirming data retention.", id: body.id }, { status: 409 });
    }
    // Soft path: suspend the org (data retained). Hard delete only when force AND no blockers, or force with explicit confirm.
    if (blocking.length) {
      const after = await base44.asServiceRole.entities.Organisation.update(body.id, { status: "suspended" });
      await publishEvent(base44, { orgId: body.id, eventKey: "enterprise.org.suspended", entityType: "Organisation", entityId: body.id, message: `Organisation suspended: ${after?.name}`, actorUserId: actor.actorUserId });
      await writeAudit(base44, { orgId: body.id, actionType: "update", entityType: "Organisation", entityId: body.id, actorUserId: actor.actorUserId, actorRole: "platform_admin", afterState: "suspended", reason: "delete safeguard: suspended (blockers remain)" });
      return Response.json({ suspended: true, id: body.id, blocking });
    }
    const before = await base44.asServiceRole.entities.Organisation.get(body.id);
    await base44.asServiceRole.entities.Organisation.delete(body.id);
    await publishEvent(base44, { orgId: body.id, eventKey: "enterprise.org.deleted", entityType: "Organisation", entityId: body.id, message: `Organisation deleted: ${before?.name || body.id}`, actorUserId: actor.actorUserId });
    await writeAudit(base44, { orgId: body.id, actionType: "delete", entityType: "Organisation", entityId: body.id, actorUserId: actor.actorUserId, actorRole: "platform_admin", beforeState: JSON.stringify({ name: before?.name, status: before?.status }), reason: "enterprise org deletion (no blockers)" });
    return Response.json({ deleted: true, id: body.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});