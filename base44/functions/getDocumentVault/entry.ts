import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveEnterpriseActor } from "../../shared/enterpriseShared.ts";
import { ENTERPRISE_ENGINE_VERSION } from "../../shared/enterpriseEngine.ts";

// Phase 13 — getDocumentVault: list documents + their version history.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveEnterpriseActor(base44, body);
    if (actor.unauthorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!actor.isPlatformAdmin && !actor.orgId) return Response.json({ error: "Forbidden" }, { status: 403 });
    // Only a TRUE platform admin may read across organisations; org admins are
    // org-scoped. Within an org, org admins see all sites; site-restricted users
    // see only documents for their assigned sites (or org-level, site_id null).
    const orgFilter = actor.isPlatformAdmin && body.organisation_id
      ? { organisation_id: body.organisation_id }
      : actor.isPlatformAdmin ? {} : { organisation_id: actor.orgId };
    let docs = await base44.asServiceRole.entities.VaultDocument.filter(orgFilter, "-created_date", 500);
    let versions = await base44.asServiceRole.entities.DocumentVersion.filter(orgFilter, "-uploaded_at", 1000);
    if (actor.isSiteRestricted) {
      const siteIds: string[] = actor.siteIds || [];
      docs = docs.filter((d: any) => !d.site_id || siteIds.includes(d.site_id));
      const allowedIds = new Set(docs.map((d: any) => d.id));
      versions = versions.filter((v: any) => allowedIds.has(v.document_id));
    }
    const byDoc: Record<string, any[]> = {};
    for (const v of versions) (byDoc[v.document_id] = byDoc[v.document_id] || []).push(v);
    return Response.json({
      engine_version: ENTERPRISE_ENGINE_VERSION,
      documents: docs.map((d: any) => ({
        id: d.id, organisation_id: d.organisation_id, site_id: d.site_id, category: d.category,
        title: d.title, current_version: d.current_version, current_file_url: d.current_file_url,
        file_size: d.file_size, expiry_date: d.expiry_date, uploaded_by_user_id: d.uploaded_by_user_id,
        status: d.status, linked_org_id: d.linked_org_id, linked_site_id: d.linked_site_id,
        created_date: d.created_date, updated_date: d.updated_date,
        versions: (byDoc[d.id] || []).map((v: any) => ({ id: v.id, version: v.version, file_url: v.file_url, file_size: v.file_size, uploaded_by_user_id: v.uploaded_by_user_id, uploaded_at: v.uploaded_at, notes: v.notes })),
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});