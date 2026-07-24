import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatValue } from '@/lib/financialFormat';
import { Coins, RefreshCw } from 'lucide-react';

const GROUP_LABEL = { pl_line: 'Profit & Loss', balance_sheet_line: 'Balance Sheet', cash_flow_line: 'Cash Flow', tax_line: 'Tax', kpi: 'KPI' };
const GROUP_ORDER = ['pl_line', 'balance_sheet_line', 'cash_flow_line', 'tax_line', 'kpi'];
const confColor = (c) => c === 'confirmed' ? 'text-emerald-400' : c === 'estimated' ? 'text-amber-400' : 'text-zinc-400';

export default function FinancialResults() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [includeSuperseded, setIncludeSuperseded] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getCurrentFinancialResults', { include_superseded: includeSuperseded });
      setResults(res.results || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [includeSuperseded]);

  const byGroup = {};
  results.forEach((r) => { (byGroup[r.entity_type] = byGroup[r.entity_type] || []).push(r); });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Financial Results</h1>
          <p className="text-sm text-zinc-500">Current (latest per line) deterministic financial outputs with confidence, methodology and run metadata.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={includeSuperseded} onChange={(e) => setIncludeSuperseded(e.target.checked)} className="accent-amber-500" />
            Show superseded history
          </label>
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : results.length === 0 ? <p className="text-sm text-zinc-600">No results yet. Run a calculation first.</p> : (
        <div className="space-y-6">
          {GROUP_ORDER.filter((g) => byGroup[g]?.length).map((g) => (
            <Card key={g}>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Coins className="w-4 h-4" /> {GROUP_LABEL[g]} <span className="text-xs text-zinc-500 font-normal">({byGroup[g].length})</span></CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-1.5 pr-3 font-medium">Line</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Value</th>
                        <th className="py-1.5 pr-3 font-medium">Unit</th>
                        <th className="py-1.5 pr-3 font-medium">Confidence</th>
                        <th className="py-1.5 pr-3 font-medium">Period</th>
                        {includeSuperseded && <th className="py-1.5 font-medium">Superseded?</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {byGroup[g].map((r) => (
                        <tr key={r.id} className="hover:bg-zinc-900/40">
                          <td className="py-1.5 pr-3 text-zinc-300">{r.label}</td>
                          <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-zinc-100">{formatValue(r.value, r.unit)}</td>
                          <td className="py-1.5 pr-3 text-zinc-500 font-mono text-xs">{r.unit}</td>
                          <td className={`py-1.5 pr-3 text-xs ${confColor(r.confidence)}`}>{r.confidence}</td>
                          <td className="py-1.5 pr-3 text-zinc-500 text-xs">{r.period_start}→{r.period_end}</td>
                          {includeSuperseded && <td className="py-1.5">{r.supersedes_result_id ? <Badge variant="outline" className="text-xs text-zinc-400">superseded</Badge> : <span className="text-xs text-emerald-400">current</span>}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}