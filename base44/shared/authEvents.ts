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

// A request with no authenticated user is trusted as a platform/scheduled
// invocation ONLY when it presents the configured service token. Fail closed:
// if PLATFORM_SERVICE_TOKEN is unset, or the token is absent or mismatched, the
// caller is NOT trusted. Scheduled workflows must send { service_token }.
export function isTrustedPlatformCall(body) {
  const expected = (typeof Deno !== "undefined" && Deno.env.get("PLATFORM_SERVICE_TOKEN")) || "";
  const provided = (body && body.service_token) || "";
  return expected.length > 0 && provided.length > 0 && provided === expected;
}

// Remove the service token from the parsed request body immediately after it has
// been checked, so no downstream handler can log, audit, persist, spread, or echo
// it. Base44's workflow DSL passes only `args` (the request body) to
// invoke_backend_function — there is no private-header channel — so the token
// necessarily arrives in the body; this strips it at the auth boundary.
export function redactServiceToken(body) {
  if (body && typeof body === "object" && "service_token" in body) delete body.service_token;
}

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

// Resolve caller context for backend functions. Returns { orgId, actorUserId, isAdmin, isScheduled }.
// Admin users run on their own org; scheduled/platform calls must pass orgId explicitly.
export async function resolveActor(base44, body) {
  const trustedPlatform = isTrustedPlatformCall(body);
  redactServiceToken(body);
  const user = await base44.auth.me().catch(() => null);
  if (user) {
    const d = user.data || {};
    // Server-derived identity is authoritative. Only a built-in platform admin
    // may act on an organisation named in the request body; every other caller
    // is pinned to their own organisation, so the client cannot select the tenant.
    const platformAdmin = user.role === "admin";
    const ownOrg = d.organisation_id || user.organisation_id || null;
    const orgId = platformAdmin ? (body.organisation_id || ownOrg) : ownOrg;
    const systemRole = d.system_role || user.system_role;
    const isAdmin = platformAdmin || systemRole === "owner" || systemRole === "system";
    if (!orgId || !isAdmin) return { forbidden: true };
    return { orgId, actorUserId: user.id, isAdmin, isScheduled: false };
  }
  // No authenticated user: trust only a verified platform/scheduled invocation
  // that presented the service token AND an explicit org. Fail closed otherwise.
  if (trustedPlatform && body.organisation_id) {
    return { orgId: body.organisation_id, actorUserId: "system", isAdmin: true, isScheduled: true };
  }
  return { unauthorized: true };
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

// Reusable object-level authorization. Fetches a record via the service role and
// confirms it belongs to the actor's organisation, returning the record so callers
// need not re-fetch. Foreign or missing ids return { ok:false, status:404 } (never
// 403) to avoid an existence oracle — mirroring the acknowledgeAlert/dismissNotification
// pattern. Callers use: const g = await assertOwnership(base44, "Scenario", id, actor);
// if (!g.ok) return Response.json({ error: g.error }, { status: g.status });
export async function assertOwnership(base44, entityType, id, actor) {
  if (!id) return { ok: false, status: 400, error: `${entityType} id required` };
  if (!actor || !actor.orgId) return { ok: false, status: 403, error: "Forbidden" };
  let record = null;
  try { record = await base44.asServiceRole.entities[entityType].get(id); } catch { record = null; }
  if (!record || record.organisation_id !== actor.orgId) return { ok: false, status: 404, error: `${entityType} not found` };
  return { ok: true, record };
}

// Site-scope guard (Phase 14H Phase 3): confirm a client-supplied site_id belongs
// to `orgId` (the authoritative write/read org). A null/absent site_id is org-level
// and passes. Foreign or missing sites return a non-enumerating 404.
export async function assertSiteInOrg(base44, siteId, orgId) {
  if (siteId === null || siteId === undefined || siteId === "") return { ok: true, record: null };
  if (!orgId) return { ok: false, status: 403, error: "Forbidden" };
  let site = null;
  try { site = await base44.asServiceRole.entities.Site.get(siteId); } catch { site = null; }
  if (!site || site.organisation_id !== orgId) return { ok: false, status: 404, error: "Site not found" };
  return { ok: true, record: site };
}

// Resolve a user targeted by an admin access-management action. Returns the user
// only if it belongs to `orgId`, or — when allowInvitee — is an unclaimed invitee
// with no organisation yet. A user in another organisation is denied with the same
// shape as "not found" (no cross-tenant existence oracle). Prevents cross-tenant
// user hijack and stops the invitee exception from claiming an existing account.
export async function resolveManagedUser(base44, userId, orgId, { allowInvitee = false } = {}) {
  if (!userId) return { ok: false, status: 400, error: "userId required" };
  if (!orgId) return { ok: false, status: 403, error: "Forbidden" };
  let user = null;
  try { user = await base44.asServiceRole.entities.User.get(userId); } catch { user = null; }
  if (!user) return { ok: false, status: 404, error: "User not found" };
  if (user.organisation_id === orgId) return { ok: true, record: user, isInvitee: false };
  if (!user.organisation_id && allowInvitee) return { ok: true, record: user, isInvitee: true };
  return { ok: false, status: 404, error: "User not found" };
}

// Bounded, complete pagination for a service-role entity read (M3). Pages via the
// documented `.filter(query, order, limit, skip)` signature (skip = 4th arg, per
// docs/phase14/pagination-audit.md) until a short/empty page is returned, so the
// result is COMPLETE (no silent truncation at the default page cap) while each
// request stays bounded. A deterministic `order` prevents skipped/duplicated rows.
// maxPages is a safety backstop against a misbehaving backend (never an unbounded loop).
export async function listAll(entityApi, query = {}, order = "-created_date", pageSize = 500, maxPages = 40) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await entityApi.filter(query, order, pageSize, page * pageSize);
    if (!rows || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

// Roles a caller may assign. Elevated roles confer platform-admin scope in the
// current model and may only be granted by a built-in platform admin
// (caller.role === "admin"). Allow-list fails closed on unknown/malformed roles.
export const ELEVATED_ROLES = new Set(["owner", "system"]);
export const ASSIGNABLE_ROLES = new Set([
  "owner", "system", "org_owner", "enterprise_admin", "regional_manager", "site_manager",
  "accountant", "financial_controller", "operations_manager", "advisor", "auditor", "read_only",
]);

// Returns { status, error } if `systemRole` may not be assigned by this caller,
// else null (no role change requested, or the assignment is permitted).
export function roleAssignmentError(systemRole, callerIsPlatformAdmin) {
  if (systemRole === undefined || systemRole === null) return null;
  if (typeof systemRole !== "string" || !ASSIGNABLE_ROLES.has(systemRole)) return { status: 400, error: "invalid role" };
  if (ELEVATED_ROLES.has(systemRole) && !callerIsPlatformAdmin) {
    return { status: 403, error: "Forbidden: only a platform administrator may assign owner/system roles" };
  }
  return null;
}
