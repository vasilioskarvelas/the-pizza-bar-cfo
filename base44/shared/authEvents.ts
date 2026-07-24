// Shared module for auth/security event publishing + audit writing + the
// canonical site-cache sync. Imported by syncSiteCache and manageAccess.
// Runs against base44.asServiceRole (SystemEvent and AuditLog are create=false
// for app users — only the service role may write them).

export const EVENT = {
  USER_INVITED: "auth.user.invited",
  USER_ACTIVATED: "auth.user.activated",
  USER_DISABLED: "auth.user.disabled",
  ROLE_CHANGED: "auth.role.changed",
  SITE_ACCESS_CHANGED: "auth.site_access.changed",
  SITE_CACHE_SYNCED: "auth.site_cache.synchronised",
  PERMISSION_DENIED: "auth.permission.denied",
  MFA_STATUS_CHANGED: "auth.mfa.status.changed",
};

export const today = () => new Date().toISOString().slice(0, 10);
export const now = () => new Date().toISOString();

export async function publishEvent(base44, { orgId, eventKey, entityType = "User", entityId = null, message, severity = "info", siteId = null, actorUserId = null, details = null }) {
  if (!orgId) return;
  await base44.asServiceRole.entities.SystemEvent.create({
    organisation_id: orgId, site_id: siteId, event_key: eventKey, entity_type: entityType,
    entity_id: entityId, severity, message, details, actor_user_id: actorUserId, occurred_at: now(),
  });
}

export async function writeAudit(base44, { orgId, actionType, entityType, entityId, actorUserId, actorRole = null, beforeState = null, afterState = null, reason = null, success = true, siteId = null }) {
  if (!orgId) return;
  await base44.asServiceRole.entities.AuditLog.create({
    organisation_id: orgId, site_id: siteId, action_type: actionType, entity_type: entityType,
    entity_id: entityId, actor_user_id: actorUserId, actor_role: actorRole,
    before_state: beforeState, after_state: afterState, reason, success,
  });
}

// Canonical site-cache sync: reads ACTIVE UserSiteAccess, rebuilds User.site_ids[],
// updates site_ids_synced_at, publishes a SystemEvent + AuditLog. This is the ONLY
// path that writes User.site_ids[] — frontend never edits it directly.
export async function syncUserSiteCache(base44, { orgId, userId, actorUserId = null }) {
  const records = await base44.asServiceRole.entities.UserSiteAccess.filter({ organisation_id: orgId, user_id: userId });
  const t = today();
  const active = records.filter((r) => !r.effective_to || r.effective_to >= t);
  const siteIds = active.map((r) => r.site_id);
  const before = await base44.asServiceRole.entities.User.get(userId);
  const prev = (before.site_ids || []).slice().sort().join(",");
  const next = siteIds.slice().sort().join(",");
  await base44.asServiceRole.entities.User.update(userId, {
    organisation_id: orgId, site_ids: siteIds, site_ids_synced_at: now(),
  });
  await publishEvent(base44, { orgId, eventKey: EVENT.SITE_CACHE_SYNCED, entityId: userId, message: `Site cache rebuilt: ${siteIds.length} site(s)`, actorUserId, details: JSON.stringify({ from: prev, to: next }) });
  await writeAudit(base44, { orgId, actionType: "update", entityType: "User", entityId: userId, actorUserId, actorRole: "system", beforeState: prev, afterState: next, reason: "site cache sync" });
  return siteIds;
}