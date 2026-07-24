import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { publishEvent, writeAudit, syncUserSiteCache, EVENT, today } from "../../shared/authEvents.ts";

// Admin access management. Every action independently validates the caller is an
// admin/owner of the same organisation (deny-by-default). Writes UserProfile,
// UserOrganisationRole, UserSiteAccess as service role, then syncs the site
// cache and publishes the matching SystemEvent + AuditLog.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const d = caller.data || {};
    const orgId = d.organisation_id || caller.organisation_id;
    const callerRole = d.system_role || caller.system_role;
    const isAdmin = caller.role === 'admin' || callerRole === 'owner' || callerRole === 'system';
    if (!orgId || !isAdmin) {
      if (orgId) await publishEvent(base44, { orgId, eventKey: EVENT.PERMISSION_DENIED, entityId: caller.id, message: 'manageAccess denied', actorUserId: caller.id });
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    const action = body.action;
    const S = base44.asServiceRole.entities;
    const actor = caller.id;

    if (action === 'invite') {
      const { email, systemRole = 'site_manager', siteIds = [] } = body;
      if (!email) return Response.json({ error: 'email required' }, { status: 400 });
      try { await base44.users.inviteUser(email, 'user'); } catch (e) { return Response.json({ error: 'invite failed: ' + e.message }, { status: 400 }); }
      await publishEvent(base44, { orgId, eventKey: EVENT.USER_INVITED, message: `Invited ${email} as ${systemRole}`, actorUserId: actor, details: JSON.stringify({ systemRole, siteIds }) });
      await writeAudit(base44, { orgId, actionType: 'create', entityType: 'User', actorUserId: actor, actorRole: callerRole, afterState: JSON.stringify({ email, systemRole, siteIds }), reason: 'user invited' });
      return Response.json({ ok: true, email, systemRole, siteIds });
    }

    if (action === 'provision' || action === 'changeRole' || action === 'changeSites') {
      const { userId, email, systemRole, siteIds } = body;
      if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
      let target;
      try { target = await S.User.get(userId); } catch { return Response.json({ error: 'User not found' }, { status: 404 }); }
      let profile = (await S.UserProfile.filter({ organisation_id: orgId, user_id: userId }))[0];
      const profileData = { organisation_id: orgId, user_id: userId, user_email: email || target?.email, system_role: systemRole || profile?.system_role, status: 'active' };
      if (profile) await S.UserProfile.update(profile.id, profileData); else await S.UserProfile.create(profileData);
      if (systemRole) {
        await S.User.update(userId, { organisation_id: orgId, system_role: systemRole });
        const role = (await S.Role.filter({ organisation_id: orgId, name: systemRole }))[0];
        if (role) {
          const existing = await S.UserOrganisationRole.filter({ organisation_id: orgId, user_id: userId });
          for (const u of existing) if (u.role_id !== role.id && (!u.effective_to || u.effective_to >= today())) await S.UserOrganisationRole.update(u.id, { effective_to: today() });
          const has = existing.some((u) => u.role_id === role.id);
          if (!has) await S.UserOrganisationRole.create({ organisation_id: orgId, user_id: userId, role_id: role.id, effective_from: today() });
        }
      }
      if (Array.isArray(siteIds)) {
        const existing = await S.UserSiteAccess.filter({ organisation_id: orgId, user_id: userId });
        const bySite = {}; for (const s of existing) bySite[s.site_id] = s;
        const keep = new Set(siteIds);
        for (const s of existing) if (!keep.has(s.site_id) && (!s.effective_to || s.effective_to >= today())) await S.UserSiteAccess.update(s.id, { effective_to: today() });
        for (const sid of siteIds) {
          if (!bySite[sid]) await S.UserSiteAccess.create({ organisation_id: orgId, user_id: userId, site_id: sid, effective_from: today() });
          else if (bySite[sid].effective_to) await S.UserSiteAccess.update(bySite[sid].id, { effective_to: null, effective_from: today() });
        }
      }
      const synced = await syncUserSiteCache(base44, { orgId, userId, actorUserId: actor });
      const eventKey = action === 'changeRole' ? EVENT.ROLE_CHANGED : action === 'changeSites' ? EVENT.SITE_ACCESS_CHANGED : EVENT.USER_ACTIVATED;
      await publishEvent(base44, { orgId, eventKey, entityId: userId, message: `${action}: ${systemRole || ''} / ${synced.length} site(s)`, actorUserId: actor, details: JSON.stringify({ systemRole, siteIds: synced }) });
      await writeAudit(base44, { orgId, actionType: action === 'changeSites' ? 'update' : 'permission_change', entityType: 'User', entityId: userId, actorUserId: actor, actorRole: callerRole, afterState: JSON.stringify({ systemRole, siteIds: synced }), reason: action });
      return Response.json({ ok: true, userId, systemRole, siteIds: synced });
    }

    if (action === 'disable' || action === 'restore') {
      const { userId } = body;
      if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
      const profile = (await S.UserProfile.filter({ organisation_id: orgId, user_id: userId }))[0];
      if (profile) await S.UserProfile.update(profile.id, { status: action === 'disable' ? 'suspended' : 'active', offboarded_at: action === 'disable' ? new Date().toISOString() : null });
      const uors = await S.UserOrganisationRole.filter({ organisation_id: orgId, user_id: userId });
      const usas = await S.UserSiteAccess.filter({ organisation_id: orgId, user_id: userId });
      if (action === 'disable') {
        for (const u of uors) if (!u.effective_to || u.effective_to >= today()) await S.UserOrganisationRole.update(u.id, { effective_to: today() });
        for (const s of usas) if (!s.effective_to || s.effective_to >= today()) await S.UserSiteAccess.update(s.id, { effective_to: today() });
      } else {
        for (const u of uors) if (u.effective_to) await S.UserOrganisationRole.update(u.id, { effective_to: null });
        for (const s of usas) if (s.effective_to) await S.UserSiteAccess.update(s.id, { effective_to: null });
      }
      const synced = await syncUserSiteCache(base44, { orgId, userId, actorUserId: actor });
      await publishEvent(base44, { orgId, eventKey: action === 'disable' ? EVENT.USER_DISABLED : EVENT.USER_ACTIVATED, entityId: userId, message: `User ${action}d`, actorUserId: actor });
      await writeAudit(base44, { orgId, actionType: 'update', entityType: 'User', entityId: userId, actorUserId: actor, actorRole: callerRole, afterState: action, reason: action });
      return Response.json({ ok: true, userId, status: action === 'disable' ? 'suspended' : 'active', siteIds: synced });
    }

    if (action === 'setMfaStatus') {
      const { userId, mfaEnrolled } = body;
      if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
      const profile = (await S.UserProfile.filter({ organisation_id: orgId, user_id: userId }))[0];
      if (profile) await S.UserProfile.update(profile.id, { mfa_enrolled: !!mfaEnrolled });
      await publishEvent(base44, { orgId, eventKey: EVENT.MFA_STATUS_CHANGED, entityId: userId, message: `MFA status set to ${!!mfaEnrolled}`, actorUserId: actor });
      await writeAudit(base44, { orgId, actionType: 'update', entityType: 'UserProfile', entityId: userId, actorUserId: actor, actorRole: callerRole, afterState: String(!!mfaEnrolled), reason: 'mfa status change' });
      return Response.json({ ok: true, userId, mfa_enrolled: !!mfaEnrolled });
    }

    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});