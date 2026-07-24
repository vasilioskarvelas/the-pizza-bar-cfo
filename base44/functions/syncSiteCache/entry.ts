import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { syncUserSiteCache } from "../../shared/authEvents.ts";

// Canonical site-cache sync endpoint. Allowed for self or admin/owner.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const d = user.data || {};
    const orgId = d.organisation_id || user.organisation_id;
    if (!orgId) return Response.json({ error: 'Not provisioned' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id || user.id;
    const systemRole = d.system_role || user.system_role;
    const isAdmin = user.role === 'admin' || systemRole === 'owner' || systemRole === 'system';
    if (targetUserId !== user.id && !isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const siteIds = await syncUserSiteCache(base44, { orgId, userId: targetUserId, actorUserId: user.id });
    return Response.json({ user_id: targetUserId, site_ids: siteIds, synced_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});