// Phase 14H — Phase 1 shared-infrastructure tests.
// Runtime: Base44 backend is Deno, so these are Deno tests with an injected mock
// `base44` (the shared resolvers take `base44` as a parameter — dependency
// injection, no SDK/network needed).
//
//   Run:  deno test --allow-env base44/shared/authEvents.test.ts
//
// Covers: resolveActor (C1, C4), resolveEnterpriseActor (C4), isTrustedPlatformCall,
// redactServiceToken (token never propagates past the auth boundary), and
// assertOwnership (the object-level helper Phase 3 applies for C2/H2/H3b/H4).
// Positive, negative, authorization, tenant-isolation, and token-leak cases.
//
// Every test that touches PLATFORM_SERVICE_TOKEN runs inside withServiceToken(),
// which saves and restores the prior env value in a finally block, so a failed
// assertion can never leak the token into a later test (no cross-test pollution,
// safe even if the file were run with reordering).

import {
  resolveActor, assertOwnership, isTrustedPlatformCall, redactServiceToken,
  assertSiteInOrg, resolveManagedUser, roleAssignmentError, listAll,
} from "./authEvents.ts";
import { resolveEnterpriseActor } from "./enterpriseShared.ts";
import { METRIC_META } from "./weeklyReportEngine.ts";

// --- tiny dependency-free assert (keeps the file self-contained) --------------
function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// --- env fixture: set PLATFORM_SERVICE_TOKEN for the duration of fn, then ALWAYS
// restore the prior value (or unset), even if fn throws. value=null => unset. -----
async function withServiceToken(value: string | null, fn: () => void | Promise<void>) {
  const KEY = "PLATFORM_SERVICE_TOKEN";
  const prev = Deno.env.get(KEY); // string | undefined
  try {
    if (value === null) Deno.env.delete(KEY);
    else Deno.env.set(KEY, value);
    await fn();
  } finally {
    if (prev === undefined) Deno.env.delete(KEY);
    else Deno.env.set(KEY, prev);
  }
}

// --- mock base44 --------------------------------------------------------------
// user: the object auth.me() resolves to (null => unauthenticated).
// store: { EntityName: { id: record } } for asServiceRole.entities.<Name>.get(id).
function mkBase44(user: any, store: Record<string, Record<string, any>> = {}) {
  return {
    auth: { me: async () => user },
    asServiceRole: {
      entities: new Proxy({}, {
        get: (_t, name: string) => ({
          get: async (id: string) => (store[name] && store[name][id]) || null,
        }),
      }),
    },
  };
}

const TOKEN = "phase1-service-secret";

// ============================================================================
// resolveActor — C1: client cannot select the tenant
// ============================================================================

Deno.test("resolveActor: authenticated org owner CANNOT read a foreign org (C1)", async () => {
  const user = { id: "u1", role: "user", data: { organisation_id: "orgA", system_role: "owner" } };
  const actor = await resolveActor(mkBase44(user), { organisation_id: "orgB" });
  eq(actor.orgId, "orgA", "org owner must be pinned to own org, not the body-supplied orgB");
  eq(actor.isScheduled, false);
  eq(actor.isAdmin, true);
});

Deno.test("resolveActor: authenticated 'system' role also cannot select a foreign org (C1)", async () => {
  const user = { id: "u1b", role: "user", data: { organisation_id: "orgA", system_role: "system" } };
  const actor = await resolveActor(mkBase44(user), { organisation_id: "orgB" });
  eq(actor.orgId, "orgA", "system-role org member is not a built-in platform admin; must pin to own org");
});

Deno.test("resolveActor: built-in platform admin MAY act on a named org (legit cross-org preserved)", async () => {
  const user = { id: "u2", role: "admin", data: { organisation_id: "orgA", system_role: "owner" } };
  const actor = await resolveActor(mkBase44(user), { organisation_id: "orgB" });
  eq(actor.orgId, "orgB", "platform admin (user.role==='admin') may target orgB");
});

Deno.test("resolveActor: non-admin authenticated user is forbidden (authorization preserved)", async () => {
  const user = { id: "u3", role: "user", data: { organisation_id: "orgA", system_role: "site_manager" } };
  const actor = await resolveActor(mkBase44(user), {});
  eq(actor.forbidden, true, "site_manager is not admin/owner/system => forbidden");
});

Deno.test("resolveActor: same-org call is unchanged (positive / no regression)", async () => {
  const user = { id: "u4", role: "user", data: { organisation_id: "orgA", system_role: "owner" } };
  const actor = await resolveActor(mkBase44(user), { organisation_id: "orgA" });
  eq(actor.orgId, "orgA");
  eq(actor.isAdmin, true);
  eq(actor.actorUserId, "u4");
});

// ============================================================================
// resolveActor — C4: unauthenticated fallback must fail closed
// ============================================================================

Deno.test("resolveActor: anonymous caller WITHOUT service token is unauthorized (C4)", async () => {
  await withServiceToken(null, async () => {
    const actor = await resolveActor(mkBase44(null), { organisation_id: "orgB" });
    eq(actor.unauthorized, true, "no user + no token must NOT grant admin");
  });
});

Deno.test("resolveActor: anonymous caller with WRONG token is unauthorized (C4)", async () => {
  await withServiceToken(TOKEN, async () => {
    const actor = await resolveActor(mkBase44(null), { organisation_id: "orgB", service_token: "wrong" });
    eq(actor.unauthorized, true);
  });
});

Deno.test("resolveActor: verified scheduled call WITH correct token is trusted (1b positive)", async () => {
  await withServiceToken(TOKEN, async () => {
    const actor = await resolveActor(mkBase44(null), { organisation_id: "orgB", service_token: TOKEN });
    eq(actor.orgId, "orgB");
    eq(actor.isScheduled, true);
    eq(actor.isAdmin, true);
    eq(actor.actorUserId, "system");
  });
});

Deno.test("resolveActor: correct token but NO org still unauthorized (fail closed)", async () => {
  await withServiceToken(TOKEN, async () => {
    const actor = await resolveActor(mkBase44(null), { service_token: TOKEN });
    eq(actor.unauthorized, true, "scheduled call must supply an explicit organisation_id");
  });
});

// ============================================================================
// Token redaction — the token must never survive the auth boundary
// ============================================================================

Deno.test("resolveActor: service_token is stripped from body after a verified call (no leak)", async () => {
  await withServiceToken(TOKEN, async () => {
    const body: Record<string, unknown> = { organisation_id: "orgB", service_token: TOKEN };
    await resolveActor(mkBase44(null), body);
    eq("service_token" in body, false, "token must be deleted so no downstream sink can persist/log it");
  });
});

Deno.test("resolveActor: service_token is stripped even on an authenticated call", async () => {
  const body: Record<string, unknown> = { organisation_id: "orgB", service_token: "stray" };
  const user = { id: "u5", role: "user", data: { organisation_id: "orgA", system_role: "owner" } };
  await resolveActor(mkBase44(user), body);
  eq("service_token" in body, false);
});

Deno.test("resolveEnterpriseActor: service_token is stripped from body after verification", async () => {
  await withServiceToken(TOKEN, async () => {
    const body: Record<string, unknown> = { organisation_id: "orgB", service_token: TOKEN };
    await resolveEnterpriseActor(mkBase44(null), body);
    eq("service_token" in body, false);
  });
});

Deno.test("redactServiceToken: removes the field and is a no-op when absent", () => {
  const a: Record<string, unknown> = { service_token: "x", keep: 1 };
  redactServiceToken(a);
  eq("service_token" in a, false);
  eq(a.keep, 1);
  const b: Record<string, unknown> = { keep: 2 };
  redactServiceToken(b); // no throw, no-op
  eq(b.keep, 2);
});

// ============================================================================
// isTrustedPlatformCall — primitive
// ============================================================================

Deno.test("isTrustedPlatformCall: fails closed when PLATFORM_SERVICE_TOKEN unset", async () => {
  await withServiceToken(null, () => {
    eq(isTrustedPlatformCall({ service_token: "anything" }), false);
  });
});

Deno.test("isTrustedPlatformCall: true only on exact match", async () => {
  await withServiceToken(TOKEN, () => {
    eq(isTrustedPlatformCall({ service_token: TOKEN }), true);
    eq(isTrustedPlatformCall({ service_token: TOKEN + "x" }), false);
    eq(isTrustedPlatformCall({}), false);
  });
});

// ============================================================================
// resolveEnterpriseActor — C4 parity + tenant pinning
// ============================================================================

Deno.test("resolveEnterpriseActor: anonymous WITHOUT token is unauthorized (C4)", async () => {
  await withServiceToken(null, async () => {
    const actor = await resolveEnterpriseActor(mkBase44(null), { organisation_id: "orgB" });
    eq(actor.unauthorized, true);
  });
});

Deno.test("resolveEnterpriseActor: verified scheduled call is platform admin for the org (1b positive)", async () => {
  await withServiceToken(TOKEN, async () => {
    const actor = await resolveEnterpriseActor(mkBase44(null), { organisation_id: "orgB", service_token: TOKEN });
    eq(actor.isPlatformAdmin, true);
    eq(actor.orgId, "orgB");
  });
});

Deno.test("resolveEnterpriseActor: authenticated org member is pinned to own org (C1 parity)", async () => {
  const user = { id: "e1", role: "user", data: { organisation_id: "orgA", system_role: "site_manager" } };
  const actor = await resolveEnterpriseActor(mkBase44(user), { organisation_id: "orgB" });
  eq(actor.orgId, "orgA", "org member cannot select orgB via the body");
  eq(actor.isPlatformAdmin, false);
});

// ============================================================================
// assertOwnership — object-level authorization (used by Phase 3: C2/H2/H3b/H4)
// ============================================================================

Deno.test("assertOwnership: own-org record returns ok with the record (positive)", async () => {
  const b = mkBase44(null, { Scenario: { s1: { id: "s1", organisation_id: "orgA" } } });
  const res = await assertOwnership(b, "Scenario", "s1", { orgId: "orgA" });
  eq(res.ok, true);
  eq(res.record.id, "s1");
});

Deno.test("assertOwnership: foreign-org record is 404, no oracle (C2/H2/H4 isolation)", async () => {
  const b = mkBase44(null, { Scenario: { s1: { id: "s1", organisation_id: "orgB" } } });
  const res = await assertOwnership(b, "Scenario", "s1", { orgId: "orgA" });
  eq(res.ok, false);
  eq(res.status, 404, "foreign record must look identical to a missing one");
});

Deno.test("assertOwnership: missing record is 404", async () => {
  const b = mkBase44(null, { Scenario: {} });
  const res = await assertOwnership(b, "Scenario", "nope", { orgId: "orgA" });
  eq(res.ok, false);
  eq(res.status, 404);
});

Deno.test("assertOwnership: missing id is 400", async () => {
  const b = mkBase44(null, {});
  const res = await assertOwnership(b, "Scenario", null, { orgId: "orgA" });
  eq(res.status, 400);
});

Deno.test("assertOwnership: actor without org is forbidden (fail closed)", async () => {
  const b = mkBase44(null, { Scenario: { s1: { id: "s1", organisation_id: "orgA" } } });
  const res = await assertOwnership(b, "Scenario", "s1", {});
  eq(res.status, 403);
});

Deno.test("assertOwnership: connector cross-tenant probe is 404 (H3b/H4 isolation)", async () => {
  const b = mkBase44(null, { Connector: { c1: { id: "c1", organisation_id: "orgB" } } });
  const res = await assertOwnership(b, "Connector", "c1", { orgId: "orgA" });
  eq(res.status, 404);
});

// ============================================================================
// Phase 3 — assertSiteInOrg (site-level tenant isolation, B)
// ============================================================================

Deno.test("assertSiteInOrg: same-org site is allowed (req #5)", async () => {
  const b = mkBase44(null, { Site: { s1: { id: "s1", organisation_id: "orgA" } } });
  const res = await assertSiteInOrg(b, "s1", "orgA");
  eq(res.ok, true);
  eq(res.record.id, "s1");
});

Deno.test("assertSiteInOrg: foreign-org site is rejected 404 before use (req #4)", async () => {
  const b = mkBase44(null, { Site: { s1: { id: "s1", organisation_id: "orgB" } } });
  const res = await assertSiteInOrg(b, "s1", "orgA");
  eq(res.ok, false);
  eq(res.status, 404);
});

Deno.test("assertSiteInOrg: null site is org-level and passes (nothing to validate)", async () => {
  const b = mkBase44(null, { Site: {} });
  const res = await assertSiteInOrg(b, null, "orgA");
  eq(res.ok, true);
  eq(res.record, null);
});

Deno.test("assertSiteInOrg: missing site is 404", async () => {
  const b = mkBase44(null, { Site: {} });
  const res = await assertSiteInOrg(b, "nope", "orgA");
  eq(res.status, 404);
});

// ============================================================================
// Phase 3 — resolveManagedUser (manageAccess H2 cross-tenant hijack, A)
// ============================================================================

Deno.test("resolveManagedUser: same-org user is resolvable (req #1 support)", async () => {
  const b = mkBase44(null, { User: { u1: { id: "u1", organisation_id: "orgA" } } });
  const res = await resolveManagedUser(b, "u1", "orgA");
  eq(res.ok, true);
  eq(res.isInvitee, false);
});

Deno.test("resolveManagedUser: cross-org existing user cannot be modified/claimed — 404 (req #2)", async () => {
  const b = mkBase44(null, { User: { u1: { id: "u1", organisation_id: "orgB" } } });
  const res = await resolveManagedUser(b, "u1", "orgA", { allowInvitee: true });
  eq(res.ok, false);
  eq(res.status, 404, "foreign user must look identical to not-found (no oracle)");
});

Deno.test("resolveManagedUser: genuine new invitee (no org) can be claimed when allowed (req #3)", async () => {
  const b = mkBase44(null, { User: { u2: { id: "u2" } } }); // no organisation_id
  const res = await resolveManagedUser(b, "u2", "orgA", { allowInvitee: true });
  eq(res.ok, true);
  eq(res.isInvitee, true);
});

Deno.test("resolveManagedUser: unclaimed user is NOT claimable when allowInvitee is false", async () => {
  const b = mkBase44(null, { User: { u2: { id: "u2" } } });
  const res = await resolveManagedUser(b, "u2", "orgA"); // disable/restore/setMfa path
  eq(res.ok, false);
  eq(res.status, 404);
});

Deno.test("resolveManagedUser: missing user 404, missing id 400", async () => {
  const b = mkBase44(null, { User: {} });
  eq((await resolveManagedUser(b, "gone", "orgA")).status, 404);
  eq((await resolveManagedUser(b, null, "orgA")).status, 400);
});

// ============================================================================
// Phase 3 — roleAssignmentError (privilege-escalation guard, D)
// ============================================================================

Deno.test("roleAssignmentError: org admin cannot grant platform-admin roles (req #8)", () => {
  eq(roleAssignmentError("system", false)?.status, 403);
  eq(roleAssignmentError("owner", false)?.status, 403);
});

Deno.test("roleAssignmentError: platform admin may grant elevated roles", () => {
  eq(roleAssignmentError("system", true), null);
  eq(roleAssignmentError("owner", true), null);
});

Deno.test("roleAssignmentError: insufficient role cannot grant a stronger role; normal roles pass (req #9)", () => {
  // a non-platform caller assigning a normal org role is allowed
  eq(roleAssignmentError("site_manager", false), null);
  // but cannot escalate to an elevated role
  eq(roleAssignmentError("owner", false)?.status, 403);
});

Deno.test("roleAssignmentError: unknown/malformed role fails closed (400); absent role is a no-op", () => {
  eq(roleAssignmentError("superuser", false)?.status, 400);
  eq(roleAssignmentError("", false)?.status, 400);
  eq(roleAssignmentError(undefined, false), null);
  eq(roleAssignmentError(null, true), null);
});

// ============================================================================
// Phase 4 — M3 listAll pagination, M5 runway unit, M2 create-gate basis
// ============================================================================

Deno.test("listAll: pages through ALL in-scope records (M3, req #6)", async () => {
  const data = Array.from({ length: 1200 }, (_, i) => ({ id: "r" + i }));
  const api = { filter: async (_q: any, _o: any, limit: number, skip: number) => data.slice(skip, skip + limit) };
  const all = await listAll(api, {}, "-id", 500);
  eq(all.length, 1200, "must not truncate at the default page cap");
});

Deno.test("listAll: stops on a short/empty page (bounded, no infinite loop)", async () => {
  const api = { filter: async (_q: any, _o: any, limit: number, skip: number) => (skip === 0 ? [{ id: 1 }, { id: 2 }] : []) };
  const all = await listAll(api, {}, "-id", 500);
  eq(all.length, 2);
});

Deno.test("M5: cash_runway metric is reported in weeks, not days", () => {
  eq(METRIC_META.cash_runway.unit, "weeks");
});

Deno.test("M2: a site_manager is neither org admin nor platform admin — create gate blocks (req #4)", async () => {
  const user = { id: "sm", role: "user", data: { organisation_id: "orgA", system_role: "site_manager" } };
  const actor = await resolveEnterpriseActor(mkBase44(user), {});
  eq(actor.isPlatformAdmin, false);
  eq(actor.isOrganisationAdmin, false);
});

Deno.test("M2: an org owner IS an org admin (but NOT a platform admin) — create gate allows (req #5)", async () => {
  const user = { id: "ow", role: "user", data: { organisation_id: "orgA", system_role: "owner" } };
  const actor = await resolveEnterpriseActor(mkBase44(user), {});
  eq(actor.isOrganisationAdmin, true);
  eq(actor.isPlatformAdmin, false);
});

// ============================================================================
// Phase 4.5 — platform-admin vs organisation-admin separation
// ============================================================================

Deno.test("4.5: TRUE platform admin (role=admin) may target another org explicitly (req #1)", async () => {
  // Canonical platform operator: no home organisation, so an explicit
  // body.organisation_id is honoured as the target. (An admin who is ALSO a tenant
  // member keeps their own org here; endpoints do cross-org targeting via body.)
  const user = { id: "pa", role: "admin", data: {} };
  const actor = await resolveEnterpriseActor(mkBase44(user), { organisation_id: "orgB" });
  eq(actor.isPlatformAdmin, true);
  eq(actor.orgId, "orgB", "platform admin may explicitly target orgB");
});

Deno.test("4.5: org owner can administer own-org resources (req #2, #11)", async () => {
  const user = { id: "ow", role: "user", data: { organisation_id: "orgA", system_role: "owner" } };
  const actor = await resolveEnterpriseActor(mkBase44(user), {});
  eq(actor.isOrganisationAdmin, true);
  eq(actor.orgId, "orgA");
});

Deno.test("4.5: org owner CANNOT target another org via body (req #3, #6)", async () => {
  const user = { id: "ow", role: "user", data: { organisation_id: "orgA", system_role: "owner" } };
  const actor = await resolveEnterpriseActor(mkBase44(user), { organisation_id: "orgB" });
  eq(actor.orgId, "orgA", "body.organisation_id must be ignored for a non-platform actor");
  eq(actor.isPlatformAdmin, false);
});

Deno.test("4.5: org owner is NOT cross-org (no all-orgs list / no foreign reads) (req #4, #5)", async () => {
  const user = { id: "ow", role: "user", data: { organisation_id: "orgA", system_role: "owner" } };
  const actor = await resolveEnterpriseActor(mkBase44(user), {});
  // list/analytics endpoints scope on isPlatformAdmin; owner=false => own org only.
  eq(actor.isPlatformAdmin, false);
});

Deno.test("4.5: 'system' role is org admin, not platform admin", async () => {
  const user = { id: "sy", role: "user", data: { organisation_id: "orgA", system_role: "system" } };
  const actor = await resolveEnterpriseActor(mkBase44(user), { organisation_id: "orgB" });
  eq(actor.isPlatformAdmin, false);
  eq(actor.isOrganisationAdmin, true);
  eq(actor.orgId, "orgA");
});

Deno.test("4.5: site-restricted user remains restricted (req #7)", async () => {
  const user = { id: "sm", role: "user", data: { organisation_id: "orgA", system_role: "site_manager", site_ids: ["s1"] } };
  const actor = await resolveEnterpriseActor(mkBase44(user), {});
  eq(actor.isSiteRestricted, true);
  eq(actor.siteIds.length, 1);
});

Deno.test("4.5: unknown role gets neither org-admin nor platform-admin — fails closed (req #8)", async () => {
  const user = { id: "x", role: "user", data: { organisation_id: "orgA", system_role: "wizard" } };
  const actor = await resolveEnterpriseActor(mkBase44(user), { organisation_id: "orgB" });
  eq(actor.isPlatformAdmin, false);
  eq(actor.isOrganisationAdmin, false);
  eq(actor.isSiteRestricted, true);
  eq(actor.orgId, "orgA");
});

Deno.test("4.5: alias-like org roles do NOT escalate to platform admin (req #9)", async () => {
  for (const role of ["org_owner", "enterprise_admin"]) {
    const user = { id: "a", role: "user", data: { organisation_id: "orgA", system_role: role } };
    const actor = await resolveEnterpriseActor(mkBase44(user), { organisation_id: "orgB" });
    eq(actor.isPlatformAdmin, false, `${role} must not be platform admin`);
    eq(actor.orgId, "orgA", `${role} must be pinned to own org`);
  }
});

Deno.test("4.5: scheduled/null-user without a service token remains denied (req #12)", async () => {
  await withServiceToken(null, async () => {
    const actor = await resolveEnterpriseActor(mkBase44(null), { organisation_id: "orgB" });
    eq(actor.unauthorized, true);
  });
});
