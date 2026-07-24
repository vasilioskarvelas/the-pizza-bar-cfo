// Phase 08 — forecast/timeline display helpers (frontend only; no calculation).
import { fmtValue as baseFmt } from './dashboardFormat';

export const HORIZON_OPTIONS = [
  { key: 1, label: "30 days" },
  { key: 3, label: "90 days" },
  { key: 6, label: "6 months" },
  { key: 12, label: "12 months" },
  { key: 24, label: "24 months" },
];

export const GRANULARITY_OPTIONS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "yearly", label: "Yearly" },
];

export const KIND_STYLE = {
  actual: { color: "#10b981", dash: false, label: "Actual" },      // emerald
  confirmed: { color: "#10b981", dash: false, label: "Actual" },
  estimated: { color: "#f59e0b", dash: true, label: "Estimated" }, // amber dashed
  forecast: { color: "#f59e0b", dash: false, label: "Forecast" }, // amber
  projected: { color: "#0ea5e9", dash: true, label: "Projected" }, // sky dashed
};

export const SCENARIO_COLORS = ["#f59e0b", "#6366f1", "#ec4899", "#10b981", "#0ea5e9"];

export const ADJUSTMENT_CATALOG = [
  { type: "revenue_pct", label: "Increase revenue %", fields: [{ key: "value", label: "Change (bps, 1000=+10%)", def: 1000 }] },
  { type: "price_increase_pct", label: "Increase menu prices %", fields: [{ key: "value", label: "Change (bps)", def: 1000 }] },
  { type: "cogs_pct", label: "Change COGS %", fields: [{ key: "value", label: "Change (bps)", def: 0 }] },
  { type: "food_cost_pct", label: "Change food cost (bps of revenue)", fields: [{ key: "value", label: "Delta (bps)", def: 500 }] },
  { type: "labour_pct", label: "Change labour (bps of revenue)", fields: [{ key: "value", label: "Delta (bps)", def: -1000 }] },
  { type: "wage_increase_pct", label: "Wage increase %", fields: [{ key: "value", label: "Change (bps)", def: 800 }] },
  { type: "labour_absolute", label: "Labour absolute change", fields: [{ key: "value", label: "Cents/period", def: -500000 }] },
  { type: "rent_absolute", label: "Rent change (cents/period)", fields: [{ key: "value", label: "Cents/period", def: 500000 }] },
  { type: "opex_pct", label: "Operating expenses %", fields: [{ key: "value", label: "Change (bps)", def: 0 }] },
  { type: "capex", label: "Purchase equipment (one-off)", fields: [{ key: "value", label: "Cents", def: 5000000 }] },
  { type: "loan", label: "Take loan", fields: [{ key: "amount", label: "Principal (cents)", def: 50000000 }, { key: "rate", label: "Annual rate", def: 0.08 }, { key: "term", label: "Term (months)", def: 60 }] },
  { type: "loan_repayment", label: "Repay debt", fields: [{ key: "value", label: "Cents/period", def: 1000000 }] },
  { type: "debt_repayment", label: "Repay debt (alias)", fields: [{ key: "value", label: "Cents/period", def: 1000000 }] },
  { type: "new_store", label: "Open new store", fields: [{ key: "revenue", label: "Revenue (cents)", def: 8000000 }, { key: "cogs", label: "COGS (cents)", def: 3000000 }, { key: "labour", label: "Labour (cents)", def: 1500000 }, { key: "opex", label: "Opex (cents)", def: 1000000 }] },
  { type: "close_store", label: "Close store", fields: [{ key: "revenue", label: "Revenue removed (cents)", def: 8000000 }, { key: "cogs", label: "COGS removed", def: 3000000 }, { key: "labour", label: "Labour removed", def: 1500000 }, { key: "opex", label: "Opex removed", def: 1000000 }] },
  { type: "employees", label: "Add employees", fields: [{ key: "count", label: "Count", def: 2 }, { key: "avg_wage", label: "Avg wage (cents)", def: 400000 }] },
  { type: "gst_rate", label: "GST rate change", fields: [{ key: "value", label: "New rate", def: 0.1 }] },
  { type: "tax_rate", label: "Tax rate change", fields: [{ key: "value", label: "New rate", def: 0.25 }] },
];

export const OBLIGATION_LABELS = {
  gst: "GST/BAS", payg: "PAYG", superannuation: "Superannuation", payroll: "Payroll",
  loan_repayment: "Loan Repayment", lease: "Lease", subscription: "Subscription",
  insurance: "Insurance", manual_commitment: "Manual Commitment", tax: "Tax", capital: "Capital",
};
export const PRIORITY_STYLE = {
  critical: "text-rose-400 border-rose-500/20 bg-rose-500/5",
  high: "text-orange-400 border-orange-500/20 bg-orange-500/5",
  medium: "text-amber-400 border-amber-500/20 bg-amber-500/5",
  low: "text-sky-400 border-sky-500/20 bg-sky-500/5",
};

export function fmtValue(value, unit) { return baseFmt(value, unit); }

export function toCSV(rows, headers) {
  const head = headers.join(",");
  const body = rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  return head + "\n" + body;
}
export function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}