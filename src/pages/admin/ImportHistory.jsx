import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS_COLOR = {
  completed: 'text-emerald-400 border-emerald-500/30',
  completed_with_errors: 'text-amber-400 border-amber-500/30',
  rejected: 'text-rose-400 border-rose-500/30',
  processing: 'text-sky-400 border-sky-500/30',
};

export default function ImportHistory() {
  const [batches, setBatches] = useState([]);
  const [runs, setRuns] = useState([]);
  const [connectors, setConnectors] = useState({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [b, r, c] = await Promise.all([
      base44.entities.ImportBatch.list('-created_date', 50),
      base44.entities.ConnectorRun.list('-created_date', 50),
      base44.entities.Connector.list(),
    ]);
    setBatches(b || []);
    setRuns(r || []);
    setConnectors(Object.fromEntries((c || []).map((x) => [x.id, x])));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const runById = Object.fromEntries(runs.map((r) => [r.id, r]));
  const connName = (id) => connectors[id]?.name || (id ? id.slice(-6) : '—');
  const duration = (b) => {
    if (!b.batch_completed_at || !b.batch_started_at) return '—';
    return Math.max(0, new Date(b.batch_completed_at).getTime() - new Date(b.batch_started_at).getTime()) + 'ms';
  };
  const runBadge = (s) => STATUS_COLOR[s === 'completed' ? 'completed' : s === 'completed_with_errors' ? 'completed_with_errors' : s === 'failed' ? 'rejected' : 'processing'] || '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Import History</h1>
          <p className="text-sm text-zinc-500">Immutable import metadata: connector, records processed/imported, duplicates skipped, failures, duration, actor, trigger.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Import batches</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : batches.length === 0 ? <p className="text-sm text-zinc-600">No imports yet.</p> : (
            <div className="divide-y divide-zinc-800/60">
              {batches.map((b) => {
                const run = runById[b.connector_run_id];
                return (
                  <div key={b.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{run ? connName(run.connector_id) : '—'}</p>
                        <p className="text-xs text-zinc-500">{new Date(b.batch_started_at || b.created_date).toLocaleString('en-AU')} · run {b.connector_run_id?.slice(-8) || '—'}</p>
                      </div>
                      <Badge variant="outline" className={`text-xs ${STATUS_COLOR[b.status] || ''}`}>{b.status}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-zinc-500">
                      <span>processed: <span className="text-zinc-300">{b.record_count}</span></span>
                      <span>imported: <span className="text-emerald-300">{b.imported_count}</span></span>
                      <span>failures: <span className="text-rose-300">{b.error_count}</span></span>
                      <span>duration: <span className="text-zinc-300">{duration(b)}</span></span>
                      {run && <span>trigger: <span className="text-zinc-300">{run.run_type}</span></span>}
                      {run && <span>actor: <span className="text-zinc-300">{run.triggered_by || '—'}</span></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Connector runs</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : runs.length === 0 ? <p className="text-sm text-zinc-600">No runs yet.</p> : (
            <div className="divide-y divide-zinc-800/60">
              {runs.map((r) => (
                <div key={r.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{connName(r.connector_id)} · {r.run_type}</p>
                    <p className="text-xs text-zinc-500">{new Date(r.run_started_at || r.created_date).toLocaleString('en-AU')} · triggered by {r.triggered_by || '—'}</p>
                    {r.error_summary && <p className="text-xs text-rose-400 truncate">{r.error_summary}</p>}
                  </div>
                  <div className="text-right text-xs text-zinc-500 shrink-0">
                    <p>{r.records_fetched ?? 0} fetched · {r.records_imported ?? 0} imported · {r.records_failed ?? 0} failed</p>
                    <Badge variant="outline" className={`text-xs ${runBadge(r.status)}`}>{r.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}