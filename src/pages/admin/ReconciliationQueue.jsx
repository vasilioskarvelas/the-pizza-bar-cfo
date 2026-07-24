import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { GitCompareArrows, Hammer, RefreshCw, History } from 'lucide-react';

const runStatusColor = (s) =>
  s === 'completed' ? 'text-emerald-400 border-emerald-500/30'
  : s === 'completed_with_exceptions' ? 'text-amber-400 border-amber-500/30'
  : s === 'running' ? 'text-sky-400 border-sky-500/30'
  : 'text-rose-400 border-rose-500/30';

const SOURCES = ['all', 'xero', 'pos', 'banking', 'payroll', 'supplier_invoice', 'manual'];

export default function ReconciliationQueue() {
  const [calcRuns, setCalcRuns] = useState([]);
  const [recRuns, setRecRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [period, setPeriod] = useState({ start: '2026-07-01', end: '2026-07-31' });
  const [recon, setRecon] = useState({ a: 'xero', b: 'banking' });
  const [last, setLast] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([
        base44.entities.CalculationRun.list('-created_date', 20),
        base44.entities.ReconciliationRun.list('-created_date', 20),
      ]);
      setCalcRuns(c || []);
      setRecRuns(r || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function build() {
    setBusy('build');
    try {
      const res = await base44.functions.invoke('buildCanonicalModel', {
        period_start: period.start, period_end: period.end,
      });
      setLast({ action: 'Build canonical model', res });
      await load();
    } catch (e) { setLast({ action: 'Build canonical model', error: e.message }); }
    setBusy(null);
  }
  async function reconcile() {
    setBusy('recon');
    try {
      const res = await base44.functions.invoke('runReconciliation', {
        period_start: period.start, period_end: period.end,
        dataset_a: recon.a, dataset_b: recon.b,
      });
      setLast({ action: 'Run reconciliation', res });
      await load();
    } catch (e) { setLast({ action: 'Run reconciliation', error: e.message }); }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Reconciliation Queue</h1>
          <p className="text-sm text-zinc-500">Build the canonical financial model from immutable source records, then run deterministic reconciliation. No financial figures are exposed to users here.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Hammer className="w-4 h-4" /> Canonical model build</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div><Label className="text-xs">Period start</Label><Input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} /></div>
          <div><Label className="text-xs">Period end</Label><Input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button disabled={busy === 'build'} onClick={build}><Hammer className={`w-4 h-4 mr-1 ${busy === 'build' ? 'animate-spin' : ''}`} /> Build canonical model</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><GitCompareArrows className="w-4 h-4" /> Reconciliation engine</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs">Dataset A</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={recon.a} onChange={(e) => setRecon({ ...recon, a: e.target.value })}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Dataset B</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={recon.b} onChange={(e) => setRecon({ ...recon, b: e.target.value })}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><Button disabled={busy === 'recon'} onClick={reconcile}><GitCompareArrows className={`w-4 h-4 mr-1 ${busy === 'recon' ? 'animate-spin' : ''}`} /> Run reconciliation</Button></div>
        </CardContent>
      </Card>

      {last && (
        <Card><CardContent className="pt-4 text-sm">
          <span className="font-semibold">{last.action}: </span>
          {last.error
            ? <span className="text-rose-400">{last.error}</span>
            : <span className="text-zinc-300 font-mono text-xs">{JSON.stringify(last.res)}</span>}
        </CardContent></Card>
      )}

      <Section icon={History} title="Canonical build history (CalculationRun)">
        {loading ? <p className="text-sm text-zinc-500">Loading…</p> : calcRuns.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {calcRuns.map((r) => (
              <Card key={r.id}><CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${runStatusColor(r.status)}`}>{r.status}</Badge>
                    <span className="text-zinc-500 font-mono text-xs">{r.run_type} · {r.engine_version}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{r.period_start} → {r.period_end} · {r.result_count} results · {new Date(r.created_date).toLocaleString('en-AU')}</p>
                </div>
                <span className="text-xs text-zinc-600 font-mono">{r.id}</span>
              </CardContent></Card>
            ))}
          </div>
        )}
      </Section>

      <Section icon={GitCompareArrows} title="Reconciliation history (ReconciliationRun)">
        {loading ? <p className="text-sm text-zinc-500">Loading…</p> : recRuns.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {recRuns.map((r) => (
              <Card key={r.id}><CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${runStatusColor(r.status)}`}>{r.status}</Badge>
                    <span className="text-zinc-500 font-mono text-xs">{r.reconciliation_type}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{r.dataset_a} vs {r.dataset_b} · {r.period_start}→{r.period_end} · checked {r.total_checked} · matched {r.matched_count} · exceptions {r.exception_count}</p>
                </div>
                <span className="text-xs text-zinc-600 font-mono">{r.id}</span>
              </CardContent></Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200 mb-3"><Icon className="w-4 h-4" /> {title}</h2>
      {children}
    </div>
  );
}
function Empty() { return <p className="text-sm text-zinc-600">No runs yet.</p>; }