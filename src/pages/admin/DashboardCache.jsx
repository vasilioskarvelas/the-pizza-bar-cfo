import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, RotateCcw } from 'lucide-react';

export default function DashboardCache() {
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = async () => { try { setRuns(await base44.entities.CalculationRun.list("-created_date", 15) || []); } catch {} };
  useEffect(() => { load(); }, []);
  const invalidate = async (type) => { setBusy(true); try { await base44.functions.invoke("invalidateCalculationResults", { run_type: type }); await load(); } catch {} setBusy(false); };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Database className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Dashboard Cache</h1></div>
      <p className="text-sm text-zinc-500">Deterministic result cache (CalculationRun). Invalidation marks stale results superseded; recalculations reuse the cache when inputs are unchanged.</p>
      <div className="flex gap-2">
        <button onClick={() => invalidate("owner_score")} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 disabled:opacity-50"><RotateCcw className="w-3.5 h-3.5 inline mr-1" />Invalidate Owner Score</button>
        <button onClick={() => invalidate("kpi")} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 disabled:opacity-50"><RotateCcw className="w-3.5 h-3.5 inline mr-1" />Invalidate Financial</button>
      </div>
      <Card><CardHeader><CardTitle className="text-base">Recent Calculation Runs</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500 uppercase"><tr><th className="py-1.5 pr-3">Type</th><th className="py-1.5 pr-3">Status</th><th className="py-1.5 pr-3">Period</th><th className="py-1.5 pr-3">Cache key</th><th className="py-1.5 pr-3">Completed</th></tr></thead>
          <tbody className="divide-y divide-zinc-800/60">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-900/40">
                <td className="py-1.5 pr-3 text-zinc-300">{r.run_type}</td>
                <td className="py-1.5 pr-3 text-zinc-400">{r.status}</td>
                <td className="py-1.5 pr-3 text-zinc-500 text-xs">{r.period_start}→{r.period_end}</td>
                <td className="py-1.5 pr-3 text-zinc-500 font-mono text-xs">{r.input_snapshot_hash}</td>
                <td className="py-1.5 pr-3 text-zinc-500 text-xs">{r.run_completed_at?.slice(0, 19) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </CardContent></Card>
    </div>
  );
}