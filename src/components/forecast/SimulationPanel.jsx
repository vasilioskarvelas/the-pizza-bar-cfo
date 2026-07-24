import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { fmtValue } from '@/lib/dashboardFormat';
import ScenarioEditor from './ScenarioEditor';
import { scoreColor } from '@/lib/dashboardFormat';
import { Play } from 'lucide-react';

// Business Decision Simulator: run a what-if (no persistence), show impact.
export default function SimulationPanel() {
  const [adjustments, setAdjustments] = useState([]);
  const [horizon, setHorizon] = useState(6);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const r = await base44.functions.invoke("runScenarioSimulation", { adjustments, horizon });
      setResult(r);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Play className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Business Decision Simulator</h3>
        <label className="ml-auto text-xs text-zinc-500 flex items-center gap-1">Horizon
          <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200">
            {[1, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h}m</option>)}
          </select>
        </label>
        <button onClick={run} disabled={loading} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">{loading ? "Running…" : "Run simulation"}</button>
      </div>
      <ScenarioEditor adjustments={adjustments} onChange={setAdjustments} />
      {result && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <ScorePill label="Baseline score" value={result.baseline_score} />
            <ScorePill label="Scenario score" value={result.scenario_score} />
          </div>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900/80">
                <tr className="text-left text-zinc-500">
                  <th className="px-2 py-1.5 font-medium">Metric</th>
                  <th className="px-2 py-1.5 font-medium text-right">Baseline</th>
                  <th className="px-2 py-1.5 font-medium text-right">Scenario</th>
                  <th className="px-2 py-1.5 font-medium text-right">Δ</th>
                  <th className="px-2 py-1.5 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {result.impact.map((r) => {
                  const pc = r.pct == null ? "text-zinc-500" : r.pct > 0 ? "text-emerald-400" : r.pct < 0 ? "text-rose-400" : "text-zinc-400";
                  return (
                    <tr key={r.code}>
                      <td className="px-2 py-1.5 text-zinc-300">{r.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400">{r.baseline != null ? fmtValue(r.baseline, r.unit) : "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-200">{r.scenario != null ? fmtValue(r.scenario, r.unit) : "—"}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${pc}`}>{r.variance != null ? (r.variance > 0 ? "+" : "") + fmtValue(r.variance, r.unit) : "—"}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${pc}`}>{r.pct != null ? `${r.pct > 0 ? "+" : ""}${r.pct.toFixed(1)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CardContent></Card>
  );
}

function ScorePill({ label, value }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 text-center">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold ${scoreColor(value)}`}>{value != null ? value.toFixed(1) : "—"}</p>
    </div>
  );
}