import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatValue } from '@/lib/financialFormat';
import { Gauge, RefreshCw } from 'lucide-react';

const confColor = (c) => c === 'confirmed' ? 'text-emerald-400' : c === 'estimated' ? 'text-amber-400' : 'text-zinc-400';

export default function KpiResults() {
  const [results, setResults] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [res, defs] = await Promise.all([
        base44.functions.invoke('getCurrentFinancialResults', {}),
        base44.entities.KPIDefinition.list(),
      ]);
      const map = {}; (defs || []).forEach((k) => { map[k.code] = k; });
      setKpis(map);
      setResults((res.results || []).filter((r) => r.result_type === 'kpi'));
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">KPI Results</h1>
          <p className="text-sm text-zinc-500">Each KPI references its KPIDefinition, CalculationRun, input results, methodology and engine version, with confidence.</p>
        </div>
        <button onClick={load} className="text-zinc-400 hover:text-zinc-200"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Gauge className="w-4 h-4" /> Computed KPIs</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : results.length === 0 ? <p className="text-sm text-zinc-600">No KPI results yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">KPI</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Value</th>
                    <th className="py-1.5 pr-3 font-medium">Definition unit</th>
                    <th className="py-1.5 pr-3 font-medium">Direction</th>
                    <th className="py-1.5 pr-3 font-medium">Confidence</th>
                    <th className="py-1.5 pr-3 font-medium">Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {results.map((r) => {
                    const def = kpis[r.entity_id];
                    return (
                      <tr key={r.id} className="hover:bg-zinc-900/40">
                        <td className="py-1.5 pr-3 text-zinc-300">{r.label}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-zinc-100">{formatValue(r.value, r.unit)}</td>
                        <td className="py-1.5 pr-3 text-zinc-500 text-xs">{def?.unit || r.unit}</td>
                        <td className="py-1.5 pr-3 text-zinc-500 text-xs">{def?.direction || '—'}</td>
                        <td className={`py-1.5 pr-3 text-xs ${confColor(r.confidence)}`}>{r.confidence}</td>
                        <td className="py-1.5 pr-3 text-zinc-500 text-xs">{r.period_start}→{r.period_end}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-zinc-600 flex items-center gap-1.5"><Badge variant="outline" className="text-xs">N/A</Badge> indicates a non-applicable KPI (e.g. Cash Runway when burn is non-negative, or Revenue Growth with no prior period). Stored deterministically as 0 — never infinity or NaN.</p>
    </div>
  );
}