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