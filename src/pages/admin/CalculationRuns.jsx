import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calculator, RefreshCw, RotateCcw, Eraser, History } from 'lucide-react';

const statusColor = (s) =>
  s === 'completed' ? 'text-emerald-400 border-emerald-500/30'
  : s === 'completed_with_errors' ? 'text-amber-400 border-amber-500/30'
  : s === 'running' ? 'text-sky-400 border-sky-500/30'
  : 'text-rose-400 border-rose-500/30';

export default function CalculationRuns() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [period, setPeriod] = useState({ start: '2026-08-01', end: '2026-08-31' });
  const [last, setLast] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const r = await base44.entities.CalculationRun.list('-created_date', 30);
      setRuns((r || []).filter((x) => x.run_type === 'financial_figure'));
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function trigger(fn, label) {
    setBusy(fn);
    try {
      const res = await base44.functions.invoke(fn, {
        period_start: period.start, period_end: period.end,
      });
      setLast({ action: label, res });
      await load();
    } catch (e) { setLast({ action: label, error: e.message }); }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Calculation Runs</h1>
          <p className="text-sm text-zinc-500">Deterministic financial &amp; tax engine runs. Every run is versioned, immutable and fully traced. No financial figures are exposed to non-admin users.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Calculator className="w-4 h-4" /> Manual calculation trigger</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div><Label className="text-xs">Period start</Label><Input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} /></div>
          <div><Label className="text-xs">Period end</Label><Input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} /></div>
          <Button disabled={busy === 'runFinancialCalculations'} onClick={() => trigger('runFinancialCalculations', 'Run calculations')}><Calculator className={`w-4 h-4 mr-1 ${busy === 'runFinancialCalculations' ? 'animate-spin' : ''}`} /> Run</Button>
          <Button variant="outline" disabled={busy === 'recalculateAffectedResults'} onClick={() => trigger('recalculateAffectedResults', 'Recalculate affected')}><RotateCcw className={`w-4 h-4 mr-1 ${busy === 'recalculateAffectedResults' ? 'animate-spin' : ''}`} /> Recalculate</Button>
          <Button variant="ghost" disabled={busy === 'invalidateCalculationResults'} onClick={() => trigger('invalidateCalculationResults', 'Invalidate')}><Eraser className="w-4 h-4 mr-1" /> Invalidate</Button>
        </CardContent>
      </Card>

      {last && (
        <Card><CardContent className="pt-4 text-sm">
          <span className="font-semibold">{last.action}: </span>
          {last.error ? <span className="text-rose-400">{last.error}</span> : <span className="text-zinc-300 font-mono text-xs">{JSON.stringify(last.res)}</span>}
        </CardContent></Card>
      )}

      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200 mb-3"><History className="w-4 h-4" /> Run history</h2>
        {loading ? <p className="text-sm text-zinc-500">Loading…</p> : runs.length === 0 ? <p className="text-sm text-zinc-600">No runs yet.</p> : (
          <div className="space-y-2">
            {runs.map((r) => (
              <Card key={r.id}><CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${statusColor(r.status)}`}>{r.status}</Badge>
                    <span className="text-zinc-500 font-mono text-xs">{r.engine_version}</span>
                    {r.input_snapshot_hash && <span className="text-zinc-600 font-mono text-xs">key {r.input_snapshot_hash}</span>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{r.period_start} → {r.period_end} · {r.result_count} results · by {r.triggered_by} · {new Date(r.created_date).toLocaleString('en-AU')}</p>
                </div>
                <span className="text-xs text-zinc-600 font-mono">{r.id}</span>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}