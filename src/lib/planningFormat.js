// Phase 09 — executive planning display helpers (frontend only; no calculation).
import { fmtValue as baseFmt, SEV_STYLE } from './dashboardFormat';

export const GOAL_CATEGORY_LABELS = {
  revenue: "Revenue", profit: "Profit", cash: "Cash", owner_score: "Owner Score",
  debt_reduction: "Debt Reduction", food_cost: "Food Cost %", labour: "Labour %",
  gst: "GST Position", working_capital: "Working Capital", custom_kpi: "Custom KPI",
};

export const GOAL_STATUS_STYLE = {
  achieved: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Achieved" },
  on_track: { text: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20", label: "On Track" },
  at_risk: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "At Risk" },
  overdue: { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", label: "Overdue" },
  not_started: { text: "text-zinc-500", bg: "bg-zinc-700/30", border: "border-zinc-600/40", label: "Not Started" },
  paused: { text: "text-zinc-400", bg: "bg-zinc-800/40", border: "border-zinc-700", label: "Paused" },
};

export const INITIATIVE_STATUS_STYLE = {
  completed: { text: "text-emerald-400", bg: "bg-emerald-500/10", label: "Completed" },
  in_progress: { text: "text-sky-400", bg: "bg-sky-500/10", label: "In Progress" },
  planned: { text: "text-zinc-400", bg: "bg-zinc-800/40", label: "Planned" },
  blocked: { text: "text-rose-400", bg: "bg-rose-500/10", label: "Blocked" },
  cancelled: { text: "text-zinc-500", bg: "bg-zinc-800/40", label: "Cancelled" },
  delayed: { text: "text-orange-400", bg: "bg-orange-500/10", label: "Delayed" },
};

export const SCORECARD_STATUS_STYLE = {
  on_track: "text-emerald-400",
  watch: "text-amber-400",
  risk: "text-rose-400",
  no_data: "text-zinc-600",
};

export const RISK_LIKELIHOOD_STYLE = {
  almost_certain: "text-rose-400", likely: "text-orange-400", possible: "text-amber-400",
  unlikely: "text-sky-400", rare: "text-zinc-400",
};

export const EFFORT_STYLE = { low: "text-emerald-400", medium: "text-amber-400", high: "text-rose-400" };
export const RISK_INDICATOR_STYLE = { high: "text-rose-400", medium: "text-amber-400", low: "text-emerald-400", none: "text-zinc-500" };

export { PRIORITY_STYLE } from './forecastFormat';
export { SEV_STYLE };

export function fmtValue(value, unit) {
  if (unit === "score") return value != null ? Number(value).toFixed(1) : "—";
  if (unit === "pct") return value != null ? `${Number(value).toFixed(1)}%` : "—";
  return baseFmt(value, unit);
}

export function pctOf(part, whole) {
  if (whole == null || whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}