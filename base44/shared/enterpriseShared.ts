// Phase 13 — Enterprise shared helpers: actor resolution + RLS-safe scoping.
// Platform admins (user.role === 'admin' or system_role owner/system) may act
// across all organisations; org admins act within their own organisation.

export async function resolveEnterpriseActor(base44: any, body: any) {
  const user = await base44.auth.me().catch(() => null);
  if (user) {
    const d = user.data || {};
    const isPlatformAdmin = user.role === "admin" || d.system_role === "owner" || d.system_role === "system";
    const orgId = d.organisation_id || user.organisation_id || body.organisation_id || null;
    return { user, isPlatformAdmin, orgId, actorUserId: user.id, unauthorized: false };
  }
  // scheduled / platform invocation — must supply orgId for org-scoped work
  if (body.organisation_id) return { user: null, isPlatformAdmin: true, orgId: body.organisation_id, actorUserId: "system", unauthorized: false };
  return { unauthorized: true };
}

export function requirePlatform(actor: any) {
  return actor && actor.isPlatformAdmin;
}

// Scope a list of org records to what the actor may see.
export function scopeOrgs(actor: any, orgs: any[]) {
  if (!actor || actor.isPlatformAdmin) return orgs;
  return orgs.filter((o: any) => o.id === actor.orgId);
}

// Scope sites to actor: platform admin sees all; otherwise org + site_ids.
export function scopeSites(actor: any, sites: any[]) {
  if (!actor || actor.isPlatformAdmin) return sites;
  const siteIds: string[] = (actor.user && (actor.user.data || {}).site_ids) || [];
  return sites.filter((s: any) => s.organisation_id === actor.orgId && (!s.id || siteIds.includes(s.id) || actor.isPlatformAdmin));
}