// Phase 11 — shared weekly-activity helpers used by generateWeeklyReport and
// generateAISummary. Extracted so both functions share one implementation of
// week-window filtering, site scoping, and the activity-count loader.
import { today } from "./authEvents.ts";

export function scopeFilter(siteId: string | null) {
  return (r: any) => (siteId ? r.site_id === siteId : true);
}

export function inWeekFilter(weekStart: string, weekEnd: string) {
  const start = new Date(weekStart + "T00:00:00Z").getTime();
  const end = new Date(weekEnd + "T23:59:59Z").getTime();
  return (iso: string) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= start && t <= end;
  };
}

export function currentWeekRange(): { weekStart: string; weekEnd: string } {
  const d = new Date(today());
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  const sun = new Date(mon.getTime() + 6 * 86400000);
  return { weekStart: mon.toISOString().slice(0, 10), weekEnd: sun.toISOString().slice(0, 10) };
}

export async function loadOrgName(base44: any, orgId: string): Promise<string> {
  const o = await base44.asServiceRole.entities.Organisation.get(orgId).catch(() => null);
  return o?.name || "HFOS";
}

export async function loadSiteName(base44: any, siteId: string): Promise<string | null> {
  const s = await base44.asServiceRole.entities.Site.get(siteId).catch(() => null);
  return s?.name || null;
}

// Load this-week activity for a scope. Returns counts (activity), the filtered
// record arrays (for full-list rendering), and top open alerts (for AI context).
export async function loadWeeklyActivity(base44: any, opts: {
  orgId: string; siteId: string | null; weekStart: string; weekEnd: string; topAlertsCount?: number;
}) {
  const S = base44.asServiceRole.entities;
  const { orgId, siteId, weekStart, weekEnd, topAlertsCount = 5 } = opts;
  const inWeek = inWeekFilter(weekStart, weekEnd);
  const scope = scopeFilter(siteId);
  const [goalsAll, initsAll, decsAll, alertsAll, oppsAll] = await Promise.all([
    S.ExecutiveGoal.filter({ organisation_id: orgId }, "-created_date", 500),
    S.Initiative.filter({ organisation_id: orgId }, "-created_date", 500),
    S.ExecutiveDecision.filter({ organisation_id: orgId }, "-decision_date", 200),
    S.ExecutiveAlert.filter({ organisation_id: orgId }, "-created_date", 500),
    S.Opportunity.filter({ organisation_id: orgId }, "-created_date", 200),
  ]);
  const goalsInWeek = goalsAll.filter(scope).filter((g: any) => inWeek(g.created_date) || inWeek(g.updated_date));
  const initsInWeek = initsAll.filter(scope).filter((i: any) => inWeek(i.created_date) || inWeek(i.updated_date));
  const decsInWeek = decsAll.filter(scope).filter((d: any) => inWeek(d.decision_date) || inWeek(d.created_date));
  const alertsInWeek = alertsAll.filter(scope).filter((a: any) => inWeek(a.created_date));
  const oppsInWeek = oppsAll.filter(scope).filter((o: any) => inWeek(o.created_date) || inWeek(o.updated_date));
  const activity = {
    alerts: alertsInWeek.length, goals_updated: goalsInWeek.length,
    initiatives_updated: initsInWeek.length, decisions: decsInWeek.length,
    opportunities: oppsInWeek.length,
  };
  const topAlerts = alertsAll.filter(scope).filter((a: any) => a.status === "open").slice(0, topAlertsCount)
    .map((a: any) => ({ title: a.title, severity: a.severity, reason: a.reason, status: a.status }));
  return { activity, goalsInWeek, initsInWeek, decsInWeek, alertsInWeek, oppsInWeek, topAlerts };
}