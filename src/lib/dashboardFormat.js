// Phase 07 — dashboard display formatters (frontend only; no calculation).
export function fmtValue(value, unit) {
  if (value == null) return "—";
  const v = Number(value) || 0;
  switch (unit) {
    case "cents": return `$${(v / 100).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    case "bps": return `${(v / 100).toFixed(1)}%`;
    case "ratio_4dp": return (v / 10000).toFixed(2);
    case "days": return `${v} days`;
    case "weeks": return `${v} wk`;
    case "score": return v.toFixed(1);
    case "count": return String(v);
    default: return String(v);
  }
}
export function fmtChange(pct) {
  if (pct == null) return null;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}
export const SEV_STYLE = {
  critical: { dot: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/20", bg: "bg-rose-500/5", label: "Critical" },
  high: { dot: "bg-orange-500", text: "text-orange-400", border: "border-orange-500/20", bg: "bg-orange-500/5", label: "High" },
  medium: { dot: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-500/5", label: "Medium" },
  low: { dot: "bg-sky-500", text: "text-sky-400", border: "border-sky-500/20", bg: "bg-sky-500/5", label: "Low" },
};
export const CONF_STYLE = { confirmed: "text-emerald-400", estimated: "text-amber-400", forecast: "text-zinc-400" };
export const TREND_ARROW = { up: "↑", down: "↓", flat: "→", no_prior: "·" };
export const TREND_COLOR = { up: "text-emerald-400", down: "text-rose-400", flat: "text-zinc-400", no_prior: "text-zinc-600" };
export function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("strong")) return "text-emerald-400";
  if (s.includes("stable")) return "text-sky-400";
  if (s.includes("watch")) return "text-amber-400";
  if (s.includes("risk")) return "text-orange-400";
  if (s.includes("critical")) return "text-rose-400";
  return "text-zinc-300";
}
export function scoreColor(score) {
  if (score == null) return "text-zinc-500";
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-sky-400";
  if (score >= 50) return "text-amber-400";
  if (score >= 30) return "text-orange-400";
  return "text-rose-400";
}
export function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}