import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { writeAudit, publishEvent, now, assertSiteInOrg } from "../../shared/authEvents.ts";

// Phase 13 — uploadDocument: receives a file, uploads it, and either creates a
// new VaultDocument (version 1) or appends a DocumentVersion to an existing one.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin && !actor.orgId) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!body.title || !body.category) return Response.json({ error: "title and category required" }, { status: 400 });
    const orgId = body.organisation_id || (actor.isPlatformAdmin ? null : actor.orgId);
    if (!orgId) return Response.json({ error: "organisation_id required" }, { status: 400 });
    if (!actor.isPlatformAdmin && orgId !== actor.orgId) return Response.json({ error: "Forbidden: cross-organisation upload denied" }, { status: 403 });
    let fileUrl = body.file_url || null;
    let fileSize = body.file_size || 0;
    if (body.file) {
      const up: any = await base44.asServiceRole.integrations.Core.UploadFile({ file: body.file });
      fileUrl = up.file_url;
    }
    if (!fileUrl) return Response.json({ error: "file_url or file required" }, { status: 400 });

    if (body.document_id) {
      // new version
      const parent = await base44.asServiceRole.entities.VaultDocument.get(body.document_id);
      if (!parent) return Response.json({ error: "parent document not found" }, { status: 404 });
      if (!actor.isPlatformAdmin && parent.organisation_id !== actor.orgId) return Response.json({ error: "Forbidden" }, { status: 403 });
      const nextVersion = (parent.current_version || 0) + 1;
      await base44.asServiceRole.entities.DocumentVersion.create({
        document_id: body.document_id, organisation_id: parent.organisation_id, site_id: parent.site_id,
        version: nextVersion, file_url: fileUrl, file_size: fileSize, uploaded_by_user_id: actor.actorUserId, uploaded_at: now(), notes: body.notes || null,
      });
      const updated = await base44.asServiceRole.entities.VaultDocument.update(body.document_id, {
        current_version: nextVersion, current_file_url: fileUrl, file_size: fileSize, uploaded_by_user_id: actor.actorUserId,
        expiry_date: body.expiry_date ?? parent.expiry_date,
      });
      await publishEvent(base44, { orgId: parent.organisation_id, siteId: parent.site_id, eventKey: "enterprise.document.versioned", entityType: "VaultDocument", entityId: body.document_id, message: `New version ${nextVersion}: ${parent.title}`, actorUserId: actor.actorUserId });
      await writeAudit(base44, { orgId: parent.organisation_id, siteId: parent.site_id, actionType: "update", entityType: "VaultDocument", entityId: body.document_id, actorUserId: actor.actorUserId, afterState: `v${nextVersion}`, reason: "document version upload" });
      return Response.json({ document: { id: body.document_id, current_version: nextVersion, file_url: fileUrl } });
    }

    const siteCheck = await assertSiteInOrg(base44, body.site_id, orgId);
    if (!siteCheck.ok) return Response.json({ error: siteCheck.error }, { status: siteCheck.status });
    const doc = await base44.asServiceRole.entities.VaultDocument.create({
      organisation_id: orgId, site_id: body.site_id || null, category: body.category, title: body.title,
      current_version: 1, current_file_url: fileUrl, file_size: fileSize, expiry_date: body.expiry_date || null,
      uploaded_by_user_id: actor.actorUserId, access_log: JSON.stringify([{ at: now(), by: actor.actorUserId, action: "upload" }]),
      status: "active", linked_org_id: body.linked_org_id || null, linked_site_id: body.linked_site_id || null,
    });
    await base44.asServiceRole.entities.DocumentVersion.create({
      document_id: doc.id, organisation_id: orgId, site_id: body.site_id || null, version: 1, file_url: fileUrl,
      file_size: fileSize, uploaded_by_user_id: actor.actorUserId, uploaded_at: now(), notes: body.notes || null,
    });
    await publishEvent(base44, { orgId, siteId: doc.site_id, eventKey: "enterprise.document.created", entityType: "VaultDocument", entityId: doc.id, message: `Document created: ${body.title}`, actorUserId: actor.actorUserId });
    await writeAudit(base44, { orgId, siteId: doc.site_id, actionType: "create", entityType: "VaultDocument", entityId: doc.id, actorUserId: actor.actorUserId, afterState: JSON.stringify({ title: body.title, category: body.category }), reason: "document upload" });
    return Response.json({ document: { id: doc.id, title: doc.title, current_version: 1, file_url: fileUrl, created_date: doc.created_date } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});