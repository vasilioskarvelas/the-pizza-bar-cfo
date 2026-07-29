// Phase 10 — Weekly Report ENGINE (pure deterministic, no I/O, no AI).
// Week-over-week executive snapshot: latest-period metrics + this week's
// activity (alerts, goals, initiatives, decisions, opportunities).
// Money in cents, ratios in bps, score 0-100.

export const WEEKLY_ENGINE_VERSION = "weekly-1.0.0";

export const WEEKLY_METRIC_CODES = [
  "revenue", "gross_profit", "gross_margin", "ebitda", "net_profit", "cash", "closing_cash",
  "cash_runway", "working_capital", "current_ratio", "debt_ratio", "long_term_debt",
  "net_gst_position", "labour_cost_pct", "food_cost_pct", "owner_score",
];

export const METRIC_META: Record<string, any> = {
  revenue: { label: "Revenue", unit: "cents", direction: "maximize" },
  gross_profit: { label: "Gross Profit", unit: "cents", direction: "maximize" },
  gross_margin: { label: "Gross Margin", unit: "bps", direction: "maximize" },
  ebitda: { label: "EBITDA", unit: "cents", direction: "maximize" },
  net_profit: { label: "Net Profit", unit: "cents", direction: "maximize" },
  cash: { label: "Cash", unit: "cents", direction: "maximize" },
  closing_cash: { label: "Closing Cash", unit: "cents", direction: "maximize" },
  cash_runway: { label: "Cash Runway", unit: "weeks", direction: "maximize" },
  working_capital: { label: "Working Capital", unit: "cents", direction: "maximize" },
  current_ratio: { label: "Current Ratio", unit: "ratio_4dp", direction: "maximize" },
  debt_ratio: { label: "Debt Ratio", unit: "bps", direction: "minimize" },
  long_term_debt: { label: "Long-term Debt", unit: "cents", direction: "minimize" },
  net_gst_position: { label: "Net GST Position", unit: "cents", direction: "minimize" },
  labour_cost_pct: { label: "Labour Cost %", unit: "bps", direction: "minimize" },
  food_cost_pct: { label: "Food Cost %", unit: "bps", direction: "minimize" },
  owner_score: { label: "Owner Score", unit: "score", direction: "maximize" },
};

function iso(d: Date): string { return d.toISOString().slice(0, 10); }

// ISO week: Monday-Sunday. refDate defaults to today.
export function isoWeekRange(refDate?: string): { weekStart: string; weekEnd: string } {
  const d = refDate ? new Date(refDate) : new Date();
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMon));
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return { weekStart: iso(monday), weekEnd: iso(sunday) };
}

export function previousWeekRange(weekStart: string): { weekStart: string; weekEnd: string } {
  const mon = new Date(weekStart + "T00:00:00Z");
  const prevMon = new Date(mon.getTime() - 7 * 86400000);
  const prevSun = new Date(prevMon.getTime() + 6 * 86400000);
  return { weekStart: iso(prevMon), weekEnd: iso(prevSun) };
}

export function reportKey(orgId: string, siteId: string | null, weekStart: string): string {
  return `wr|${orgId}|${siteId || "_"}|${weekStart}`;
}

// Identify the two most recent periods present in historyMap (by revenue history).
export function latestTwoPeriods(historyMap: Record<string, any[]>): { current: string | null; prior: string | null } {
  const rev = historyMap.revenue || [];
  if (rev.length < 1) return { current: null, prior: null };
  const sorted = [...rev].sort((a, b) => String(a.period).localeCompare(String(b.period)));
  const current = sorted[sorted.length - 1].period;
  const prior = sorted.length >= 2 ? sorted[sorted.length - 2].period : null;
  return { current, prior };
}

// Build a metrics snapshot for a given period from historyMap.
export function metricsAtPeriod(historyMap: Record<string, any[]>, period: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!period) return out;
  for (const code of WEEKLY_METRIC_CODES) {
    const rec = (historyMap[code] || []).find((r) => r.period === period);
    if (rec) out[code] = Number(rec.value) || 0;
  }
  return out;
}

// Compute per-metric deltas vs prior period.
export function computeDeltas(currMetrics: Record<string, any>, prevMetrics: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const code of WEEKLY_METRIC_CODES) {
    const c = currMetrics[code] != null ? Number(currMetrics[code]) : null;
    const p = prevMetrics[code] != null ? Number(prevMetrics[code]) : null;
    if (c == null && p == null) { out[code] = null; continue; }
    const delta = c != null && p != null ? c - p : null;
    let deltaPct: number | null = null;
    if (delta != null && p !== 0) deltaPct = Math.round((delta / Math.abs(p)) * 1000) / 10;
    const meta = METRIC_META[code] || {};
    let trend = "no_prior";
    if (delta != null) {
      if (delta === 0) trend = "flat";
      else if (delta > 0 === (meta.direction === "maximize")) trend = "up";
      else trend = "down";
    }
    out[code] = { current: c, previous: p, delta, delta_pct: deltaPct, trend };
  }
  return out;
}

export function fmtCents(c: number | null): string {
  if (c == null) return "—";
  return `$${(Number(c) / 100).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtCell(v: number | null, unit?: string): string {
  if (v == null) return "—";
  if (unit === "cents") return fmtCents(v);
  if (unit === "bps") return `${(Number(v) / 100).toFixed(1)}%`;
  if (unit === "score") return Number(v).toFixed(1);
  if (unit === "days") return `${v} days`;
  if (unit === "ratio_4dp") return (Number(v) / 10000).toFixed(2);
  return String(v);
}

// Deterministic narrative summary.
export function buildSummary({ weekStart, weekEnd, deltas, activity }: any): { headline: string; narrative: string[] } {
  const lines: string[] = [];
  const rev = deltas.revenue, profit = deltas.net_profit, score = deltas.owner_score, cash = deltas.cash;
  if (rev?.current != null) {
    lines.push(`Revenue ${fmtCents(rev.current)}${rev.delta_pct != null ? ` (${rev.delta_pct >= 0 ? "+" : ""}${rev.delta_pct}% vs prior period)` : ""}.`);
  }
  if (profit?.current != null) {
    lines.push(`Net profit ${fmtCents(profit.current)}${profit.delta_pct != null ? ` (${profit.delta_pct >= 0 ? "+" : ""}${profit.delta_pct}%)` : ""}.`);
  }
  if (cash?.current != null) {
    lines.push(`Cash ${fmtCents(cash.current)}${cash.delta_pct != null ? ` (${cash.delta_pct >= 0 ? "+" : ""}${cash.delta_pct}%)` : ""}.`);
  }
  if (score?.current != null) {
    lines.push(`Owner Score ${Number(score.current).toFixed(1)}${score.delta != null ? ` (${score.delta >= 0 ? "+" : ""}${Number(score.delta).toFixed(1)})` : ""}.`);
  }
  const a = activity || {};
  lines.push(`This week: ${a.alerts || 0} alert(s), ${a.goals_updated || 0} goal update(s), ${a.initiatives_updated || 0} initiative update(s), ${a.decisions || 0} decision(s).`);
  return { headline: `Week ${weekStart} → ${weekEnd}`, narrative: lines };
}

// HTML email body for SendEmail (registered recipients only).
export function formatEmailBody(report: any, orgName: string): string {
  const s = report.summary || {};
  const d = report.deltas || {};
  const a = report.activity || {};
  const rows = WEEKLY_METRIC_CODES.filter((c) => d[c]).map((c) => {
    const m = METRIC_META[c] || {};
    const v = d[c];
    return `<tr><td style="padding:6px 0">${m.label || c}</td><td style="text-align:right;padding:6px 0">${fmtCell(v.current, m.unit)}</td><td style="text-align:right;padding:6px 0">${fmtCell(v.previous, m.unit)}</td><td style="text-align:right;padding:6px 0">${v.delta_pct != null ? (v.delta_pct >= 0 ? "+" : "") + v.delta_pct + "%" : "—"}</td></tr>`;
  }).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:auto;color:#18181b">
  <h2 style="margin:0 0 4px">${orgName || "HFOS"} — Weekly Report</h2>
  <p style="color:#71717a;margin:0 0 16px">${report.week_start} → ${report.week_end}</p>
  ${(s.narrative || []).map((l: string) => `<p style="margin:4px 0">${l}</p>`).join("")}
  <h3 style="margin:20px 0 8px">Key metrics (vs prior period)</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr style="border-bottom:1px solid #e4e4e7"><th style="text-align:left;padding:6px 0">Metric</th><th style="text-align:right">Current</th><th style="text-align:right">Prior</th><th style="text-align:right">Δ%</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h3 style="margin:20px 0 8px">This week</h3>
  <ul style="color:#3f3f46">
    <li>${a.alerts || 0} alerts</li><li>${a.goals_updated || 0} goal updates</li>
    <li>${a.initiatives_updated || 0} initiative updates</li><li>${a.decisions || 0} decisions logged</li>
  </ul>
  <p style="color:#a1a1aa;font-size:12px;margin-top:24px">Generated ${report.generated_at} · engine ${report.engine_version} · deterministic · no AI</p>
</div>`;
}