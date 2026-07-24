import React from 'react';
import { fmtValue } from '@/lib/dashboardFormat';
import { SEV_STYLE } from '@/lib/dashboardFormat';

// Scenario comparison table: baseline vs scenarios per metric, with variance + %.
export default function ComparisonTable({ comparison, scenarios }) {
  if (!comparison) return null;
  const rows = comparison.metrics || [];
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/80">
          <tr className="text-left text-[10px] text-zinc-500 uppercase tracking-wider">
            <th className="px-3 py-2 font-medium">Metric</th>
            <th className="px-3 py-2 font-medium text-right">Baseline</th>
            {(scenarios || []).map((s) => <th key={s.name} className="px-3 py-2 font-medium text-right">{s.name}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((r) => (
            <tr key={r.code} className="hover:bg-zinc-900/40">
              <td className="px-3 py-2 text-zinc-300">{r.label}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-200">{r.baseline != null ? fmtValue(r.baseline, r.unit) : "—"}</td>
              {(r.scenarios || []).map((s, i) => {
                const pctColor = s.pct == null ? "text-zinc-500" : s.pct > 0 ? "text-emerald-400" : s.pct < 0 ? "text-rose-400" : "text-zinc-400";
                return (
                  <td key={i} className="px-3 py-2 text-right tabular-nums">
                    <div className="text-zinc-200">{s.value != null ? fmtValue(s.value, r.unit) : "—"}</div>
                    {s.pct != null && <div className={`text-[10px] ${pctColor}`}>{s.pct > 0 ? "+" : ""}{s.pct.toFixed(1)}%</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {comparison.best_scenario && (
        <div className="px-3 py-2 bg-emerald-500/5 border-t border-emerald-500/20 text-xs text-emerald-300">
          Best-performing scenario by projected Owner Score: <strong>{comparison.best_scenario}</strong>
        </div>
      )}
    </div>
  );
}