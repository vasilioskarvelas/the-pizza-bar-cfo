import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, RefreshCw, AlertTriangle } from 'lucide-react';

export default function EngineStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getCalculationEngineStatus', {});
      setStatus(res);
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Engine Status</h1>
          <p className="text-sm text-zinc-500">Calculation engine health — latest run, cache key, current vs superseded result counts, and balance-sheet verification exceptions.</p>
        </div>
        <button onClick={load} className="text-zinc-400 hover:text-zinc-200"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : !status ? <p className="text-sm text-zinc-600">No status available.</p> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Engine version" value={status.engine_version} mono />
            <Stat label="Total runs" value={status.total_runs} />
            <Stat label="Current results" value={status.current_results} />
            <Stat label="Superseded results" value={status.superseded_results} />
            <Stat label="Balance verification runs" value={status.balance_verification_runs} />
            <Stat label="Balance exceptions" value={status.balance_exceptions} accent={status.balance_exceptions > 0 ? 'warn' : null} />
          </div>

          {status.latest_run && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="w-4 h-4" /> Latest run</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <Row k="Status" v={<Badge variant="outline" className="text-xs">{status.latest_run.status}</Badge>} />
                <Row k="Period" v={`${status.latest_run.period_start} → ${status.latest_run.period_end}`} />
                <Row k="Site" v={status.latest_run.site_id || 'organisation (consolidated)'} />
                <Row k="Results" v={status.latest_run.result_count} />
                <Row k="Cache key" v={status.latest_run.input_snapshot_hash} mono />
                <Row k="Methodology" v={status.latest_run.methodology_version_id || '—'} mono />
                <Row k="Triggered by" v={status.latest_run.triggered_by} />
              </CardContent>
            </Card>
          )}

          {status.balance_exceptions > 0 && (
            <Card><CardContent className="pt-4 text-sm flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-4 h-4" /> {status.balance_exceptions} balance-sheet verification run(s) recorded out-of-balance or cash-flow reconciliation exceptions. Review Reconciliation → Exceptions.
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono, accent }) {
  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${mono ? 'font-mono' : ''} ${accent === 'warn' ? 'text-amber-400' : 'text-zinc-100'}`}>{value ?? '—'}</p>
    </div>
  );
}
function Row({ k, v }) {
  return <div className="flex justify-between gap-3"><span className="text-zinc-500">{k}</span><span className="text-zinc-200 text-right font-mono text-xs">{v}</span></div>;
}