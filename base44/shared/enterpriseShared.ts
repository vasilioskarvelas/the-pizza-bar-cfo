// Phase 13 — Enterprise shared helpers: actor resolution + RLS-safe scoping.
// Platform admins (user.role === 'admin' or system_role owner/system) may act
// across all organisations; org admins act within their own organisation.

import { isTrustedPlatformCall, redactServiceToken, ELEVATED_ROLES } from "./authEvents.ts";

// Privilege model (Phase 4.5 — three distinct, non-overlapping concepts):
//   isPlatformAdmin     — TRUE platform operator (user.role === "admin" only); may
//                         act ACROSS organisations. This is the only cross-org flag.
//   isOrganisationAdmin — administers all resources within their OWN organisation
//                         (platform admin, or system_role in ELEVATED_ROLES =
//                         owner/system). Never confers cross-organisation authority.
//   isSiteRestricted    — limited to their assigned site_ids.
// An organisation-level role is NEVER mapped to platform (cross-org) privilege.
export async function resolveEnterpriseActor(base44: any, body: any) {
  const trustedPlatform = isTrustedPlatformCall(body);
  redactServiceToken(body);
  const user = await base44.auth.me().catch(() => null);
  if (user) {
    const d = user.data || {};
    const systemRole = d.system_role || user.system_role || null;
    const isPlatformAdmin = user.role === "admin";
    const isOrganisationAdmin = isPlatformAdmin || ELEVATED_ROLES.has(systemRole);
    // Client cannot select the tenant: body.organisation_id is honoured only for a
    // TRUE platform admin; every other caller is pinned to their own organisation.
    const orgId = d.organisation_id || user.organisation_id || (isPlatformAdmin ? body.organisation_id : null) || null;
    return {
      user, systemRole,
      isPlatformAdmin, isOrganisationAdmin, isSiteRestricted: !isOrganisationAdmin,
      siteIds: d.site_ids || user.site_ids || [],
      orgId, actorUserId: user.id, unauthorized: false,
    };
  }
  // No authenticated user: trust only a verified platform/scheduled invocation
  // that presented the service token AND an explicit org. Fail closed otherwise.
  if (trustedPlatform && body.organisation_id) {
    return {
      user: null, systemRole: "system",
      isPlatformAdmin: true, isOrganisationAdmin: true, isSiteRestricted: false, siteIds: [],
      orgId: body.organisation_id, actorUserId: "system", unauthorized: false,
    };
  }
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

// Extract a per-org metric snapshot from that org's latest financial + owner-score
// CalculationRuns. Reads CalculationResult by the correct field (calculation_run_id),
// aggregates result records by entity_id, and fetches per-run (bounded, no unbounded
// list). Deterministic — no recalculation, no AI.
export async function extractOrgMetrics(base44: any, orgId: string, calcRuns: any[]): Promise<Record<string, number | null>> {
  const orgRuns = calcRuns.filter((r: any) => r.organisation_id === orgId);
  // Latest by most recent REPORTING PERIOD (period_end), then created_date as tiebreak.
  // A re-run of an older period (created later) must not override the current period.
  const byPeriod = (a: any, b: any) => (b.period_end || "").localeCompare(a.period_end || "") || (b.created_date || "").localeCompare(a.created_date || "");
  const latestFin = orgRuns.filter((r: any) => r.run_type === "financial_figure").sort(byPeriod)[0];
  const latestScore = orgRuns.filter((r: any) => r.run_type === "owner_score").sort(byPeriod)[0];

  const byEntity: Record<string, number> = {};
  if (latestFin) {
    const results: any[] = await base44.asServiceRole.entities.CalculationResult.filter({ calculation_run_id: latestFin.id }, "-created_date", 500);
    for (const r of results || []) {
      if (r.entity_id && byEntity[r.entity_id] == null) byEntity[r.entity_id] = Number(r.value);
    }
  }
  let ownerScore: number | null = null;
  if (latestScore) {
    // Owner score stored as result_type "score_component", entity_id "owner_score", value = score * 100.
    const scoreResults: any[] = await base44.asServiceRole.entities.CalculationResult.filter({ calculation_run_id: latestScore.id, result_type: "score_component", entity_id: "owner_score" }, "-created_date", 50);
    ownerScore = scoreResults?.[0] ? Number(scoreResults[0].value) / 100 : null;
  }
  return {
    revenue: num(byEntity.revenue),
    net_profit: num(byEntity.net_profit),
    cash: num(byEntity.cash),
    labour_pct: num(byEntity.labour_pct ?? byEntity.labour_cost_pct),
    food_cost_pct: num(byEntity.food_cost_pct),
    debt: num(byEntity.long_term_debt ?? byEntity.total_liabilities),
    owner_score: ownerScore,
    forecast_risk: null,
  };
}

function num(v: any): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }