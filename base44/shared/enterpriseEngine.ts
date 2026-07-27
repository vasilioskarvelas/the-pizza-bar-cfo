// Phase 13 — Enterprise ENGINE (pure, no I/O). Aggregates the enterprise
// dashboard, cross-organisation analytics + benchmarking, role permission
// inheritance, and compliance status derivation. Deterministic — no AI.

import { today } from "./authEvents.ts";

export const ENTERPRISE_ENGINE_VERSION = "enterprise-1.0.0";

// Compliance status from a due date + explicit status. Filed/paid/done/waived
// are terminal; otherwise derive from days remaining.
export function complianceStatus(dueDate: string, status: string, reminderDays = 7, nowStr = today()): string {
  if (["filed", "paid", "done", "waived"].includes(status)) return status;
  if (!dueDate) return "upcoming";
  const due = new Date(dueDate + "T23:59:59Z").getTime();
  const now = new Date(nowStr + "T00:00:00Z").getTime();
  const days = Math.floor((due - now) / 86400000);
  if (days < 0) return "overdue";
  if (days <= reminderDays) return "due_soon";
  return "upcoming";
}

export const COMPLIANCE_TYPE_LABELS: Record<string, string> = {
  bas: "BAS", gst: "GST", payg: "PAYG", super: "Superannuation", payroll: "Payroll",
  asic: "ASIC", annual_review: "Annual Review", business_registration: "Business Registration",
  insurance: "Insurance", licence: "Licence",
};

// Aggregate the enterprise dashboard: totals + per-organisation rows.
export function aggregateDashboard(opts: {
  orgs: any[]; sites: any[]; users: any[]; compliance: any[];
  perOrgMetrics: Record<string, any>; weeklyReports: number; aiSummaries: number;
}) {
  const { orgs, sites, users, compliance, perOrgMetrics, weeklyReports, aiSummaries } = opts;
  const activeOrgs = orgs.filter((o: any) => o.status === "active");
  const activeSites = sites.filter((s: any) => s.status === "active");
  const openCompliance = compliance.filter((c: any) => ["overdue", "due_soon", "upcoming"].includes(complianceStatus(c.due_date, c.status, c.reminder_days)));
  const overdue = compliance.filter((c: any) => complianceStatus(c.due_date, c.status, c.reminder_days) === "overdue");

  const perOrg = orgs.map((o: any) => {
    const orgSites = sites.filter((s: any) => s.organisation_id === o.id);
    const m = perOrgMetrics[o.id] || {};
    return {
      id: o.id, name: o.name, type: o.organisation_type, status: o.status,
      sites: orgSites.length, active_sites: orgSites.filter((s: any) => s.status === "active").length,
      revenue: m.revenue ?? null, net_profit: m.net_profit ?? null, cash: m.cash ?? null,
      owner_score: m.owner_score ?? null, forecast_risk: m.forecast_risk ?? null,
      open_compliance: compliance.filter((c: any) => c.organisation_id === o.id && ["overdue", "due_soon", "upcoming"].includes(complianceStatus(c.due_date, c.status, c.reminder_days))).length,
      overdue_compliance: compliance.filter((c: any) => c.organisation_id === o.id && complianceStatus(c.due_date, c.status, c.reminder_days) === "overdue").length,
    };
  });

  return {
    totals: {
      organisations: orgs.length, active_organisations: activeOrgs.length,
      sites: sites.length, active_sites: activeSites.length,
      active_users: users.length,
      open_compliance: openCompliance.length, overdue_compliance: overdue.length,
      weekly_reports: weeklyReports, ai_summaries: aiSummaries,
      revenue: sum(perOrg, "revenue"), net_profit: sum(perOrg, "net_profit"),
    },
    per_org: perOrg,
    upcoming_obligations: compliance
      .filter((c: any) => ["overdue", "due_soon", "upcoming"].includes(complianceStatus(c.due_date, c.status, c.reminder_days)))
      .sort((a: any, b: any) => (a.due_date || "").localeCompare(b.due_date || ""))
      .slice(0, 10)
      .map((c: any) => ({ id: c.id, organisation_id: c.organisation_id, title: c.title, type: c.compliance_type, due_date: c.due_date, status: complianceStatus(c.due_date, c.status, c.reminder_days) })),
  };
}

function sum(rows: any[], field: string): number | null {
  let total = 0; let any = false;
  for (const r of rows) { if (r[field] != null) { total += Number(r[field]); any = true; } }
  return any ? total : null;
}

// Cross-organisation benchmarking. For each metric, compute mean + per-org rank
// + percentile + delta-vs-mean. direction: maximize | minimize.
export function benchmark(metricsByOrg: Record<string, Record<string, number>>, fields: { code: string; direction: "maximize" | "minimize" }[]) {
  const orgIds = Object.keys(metricsByOrg);
  const out: Record<string, any> = {};
  for (const f of fields) {
    const vals = orgIds.map((id) => metricsByOrg[id]?.[f.code]).filter((v) => v != null) as number[];
    if (!vals.length) { out[f.code] = { mean: null, ranks: {} }; continue; }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const ranks: Record<string, any> = {};
    for (const id of orgIds) {
      const v = metricsByOrg[id]?.[f.code];
      if (v == null) { ranks[id] = { value: null, rank: null, percentile: null, delta_vs_mean: null }; continue; }
      const sorted = [...vals].sort((a, b) => f.direction === "maximize" ? b - a : a - b);
      const rank = sorted.indexOf(v) + 1;
      const percentile = Math.round((1 - (rank - 1) / vals.length) * 100);
      ranks[id] = { value: v, rank, percentile, delta_vs_mean: Math.round(v - mean) };
    }
    out[f.code] = { mean: Math.round(mean), ranks };
  }
  return out;
}

// Resolve a role's effective permission codes by walking parent_role_id (inheritance).
export function resolveEffectivePermissions(roleId: string, roles: any[], rolePermissions: any[], permissionCodeById: Record<string, string>, visited: Set<string> = new Set()): Set<string> {
  if (!roleId || visited.has(roleId)) return new Set();
  visited.add(roleId);
  const role = roles.find((r: any) => r.id === roleId);
  if (!role) return new Set();
  const codes = new Set<string>();
  for (const rp of rolePermissions) {
    if (rp.role_id === roleId && permissionCodeById[rp.permission_id]) codes.add(permissionCodeById[rp.permission_id]);
  }
  if (role.parent_role_id) {
    for (const p of resolveEffectivePermissions(role.parent_role_id, roles, rolePermissions, permissionCodeById, visited)) codes.add(p);
  }
  return codes;
}

// Default enterprise role catalogue (for seeding + admin UI).
export const ENTERPRISE_ROLES = [
  { role_key: "platform_owner", name: "Platform Owner", scope: "platform", level: 100, is_system: true },
  { role_key: "enterprise_admin", name: "Enterprise Admin", scope: "platform", level: 90, is_system: true },
  { role_key: "organisation_owner", name: "Organisation Owner", scope: "organisation", level: 80, is_system: true },
  { role_key: "regional_manager", name: "Regional Manager", scope: "organisation", level: 70, is_system: false },
  { role_key: "site_manager", name: "Site Manager", scope: "site", level: 60, is_system: true },
  { role_key: "accountant", name: "Accountant", scope: "organisation", level: 50, is_system: true },
  { role_key: "financial_controller", name: "Financial Controller", scope: "organisation", level: 55, is_system: false },
  { role_key: "operations_manager", name: "Operations Manager", scope: "organisation", level: 50, is_system: false },
  { role_key: "advisor", name: "Advisor", scope: "organisation", level: 40, is_system: false },
  { role_key: "auditor", name: "Auditor", scope: "organisation", level: 30, is_system: true },
  { role_key: "read_only", name: "Read Only", scope: "organisation", level: 10, is_system: true },
];