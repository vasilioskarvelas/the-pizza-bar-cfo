// Central role-and-permission service for the frontend. Deny-by-default.
// Loads the current user + their DB-granted permissions (RolePermission) and
// site access, and exposes pure check helpers. UI hiding is NOT security —
// every sensitive backend operation is independently validated in the
// manageAccess / syncSiteCache backend functions.

import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ROLE_PERMISSIONS } from '@/lib/permissions';

let _promise = null;
let _cache = null;

export async function resolveAccess() {
  let user;
  try { user = await base44.auth.me(); } catch { return null; }
  if (!user) return null;
  const d = user.data || {};
  const orgId = d.organisation_id ?? user.organisation_id ?? null;
  const systemRole = d.system_role ?? user.system_role ?? null;
  const siteIds = d.site_ids ?? user.site_ids ?? [];
  const platformRole = user.role;

  if (!orgId || !systemRole) {
    return { user, orgId: null, systemRole: null, siteIds: [], permissions: new Set(), provisioned: false, platformAdmin: platformRole === 'admin' };
  }

  let permissions = new Set();
  try {
    const uors = await base44.entities.UserOrganisationRole.filter({ organisation_id: orgId, user_id: user.id });
    const roleIds = new Set(uors.filter((u) => !u.effective_to || u.effective_to >= new Date().toISOString().slice(0, 10)).map((u) => u.role_id));
    if (roleIds.size) {
      const [rps, allPerms] = await Promise.all([
        base44.entities.RolePermission.filter({ organisation_id: orgId }),
        base44.entities.Permission.filter({ organisation_id: orgId }),
      ]);
      const codeById = {};
      for (const p of allPerms) codeById[p.id] = p.code;
      for (const rp of rps) if (roleIds.has(rp.role_id) && codeById[rp.permission_id]) permissions.add(codeById[rp.permission_id]);
    }
  } catch {
    // deny-by-default: leave empty
  }
  // Fallback to the seeded default map only if the DB yielded nothing (e.g. seeding
  // incomplete) so a correctly-roled user is never accidentally locked out.
  if (permissions.size === 0 && systemRole && ROLE_PERMISSIONS[systemRole]) {
    for (const c of ROLE_PERMISSIONS[systemRole]) permissions.add(c);
  }

  return { user, orgId, systemRole, siteIds, permissions, provisioned: true, platformAdmin: platformRole === 'admin' };
}

export function useAccess() {
  const [ctx, setCtx] = useState(_cache);
  useEffect(() => {
    if (!_promise) _promise = resolveAccess();
    let alive = true;
    _promise.then((a) => { if (alive) { _cache = a; setCtx(a); } });
    return () => { alive = false; };
  }, []);
  return ctx;
}

// ---- Pure check helpers (all deny-by-default) ----
export const hasPermission = (ctx, code) => !!(ctx && ctx.permissions && ctx.permissions.has(code));
export const hasOrgAccess = (ctx) => !!ctx?.orgId;
export const isOwner = (ctx) => ctx?.systemRole === 'owner';
export const isSystem = (ctx) => ctx?.systemRole === 'system';
export const isPlatformAdmin = (ctx) => ctx?.platformAdmin || ctx?.systemRole === 'owner' || ctx?.systemRole === 'system';
export const canAudit = (ctx) => isPlatformAdmin(ctx) || hasPermission(ctx, 'audit.read');
export const canFinancial = (ctx) => isPlatformAdmin(ctx) || hasPermission(ctx, 'financials.read');
export const canManageUsers = (ctx) => isOwner(ctx) || hasPermission(ctx, 'users.invite') || hasPermission(ctx, 'users.manage_roles');
export const hasSiteAccess = (ctx, siteId) => {
  if (!ctx || !siteId) return false;
  if (isPlatformAdmin(ctx)) return true;
  return (ctx.siteIds || []).includes(siteId);
};