// Phase 05 — display formatters for financial result values (stored as integer
// minor units / basis points / scaled ratios).
export function formatValue(value, unit) {
  const v = Number(value) || 0;
  switch (unit) {
    case "cents": return `$${(v / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "bps": return `${(v / 100).toFixed(2)}%`;
    case "ratio_4dp": return (v / 10000).toFixed(4);
    case "days": return `${v} days`;
    case "weeks": return `${v} weeks`;
    case "count": return String(v);
    default: return String(v);
  }
}