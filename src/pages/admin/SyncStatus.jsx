import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS_COLOR = {
  active: 'text-emerald-400 border-emerald-500/30',
  paused: 'text-amber-400 border-amber-500/30',
  disabled: 'text-zinc-500 border-zinc-600',
  error: 'text-rose-400 border-rose-500/30',
};

export default function SyncStatus() {
  const [connectors, setConnectors] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [c, e] = await Promise.all([
      base44.entities.Connector.list(),
      base44.entities.ImportError.list('-created_date', 20).catch(() => []),
    ]);
    setConnectors(c || []);
    setErrors(e || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const fmt = (s) => s ? new Date(s).toLocaleString('en-AU') : 'never';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Sync Status</h1>
          <p className="text-sm text-zinc-500">Connector health: last successful sync, last failed sync, duration, statistics and recent errors.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : connectors.length === 0 ? <p className="text-sm text-zinc-600">No connectors registered.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {connectors.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{c.name}</CardTitle>
                  <Badge variant="outline" className={`text-xs ${STATUS_COLOR[c.status] || ''}`}>{c.status}</Badge>
                </div>
                <p className="text-xs text-zinc-500">{c.source_system} · {c.connector_type}</p>
              </CardHeader>
              <CardContent className="text-xs text-zinc-400 space-y-1">
                <Row label="Last run" value={fmt(c.last_run_at)} />
                <Row label="Last run status" value={c.last_run_status || '—'} />
                <Row label="Last successful sync" value={fmt(c.last_successful_sync_at)} highlight={!!c.last_successful_sync_at} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="w-4 h-4 text-amber-400" /> Recent import errors</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : errors.length === 0 ? <p className="text-sm text-zinc-600">No import errors.</p> : (
            <div className="divide-y divide-zinc-800/60">
              {errors.map((e) => (
                <div key={e.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-mono text-rose-300 truncate">{e.error_stage}: {e.error_code}</p>
                    <Badge variant="outline" className="text-xs">{e.severity}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500">{e.error_message}</p>
                  <p className="text-xs text-zinc-600">{e.external_entity_type || '—'} · {e.external_record_id || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, highlight }) {
  return <div className="flex justify-between gap-2"><span className="text-zinc-500">{label}</span><span className={highlight ? 'text-emerald-300' : 'text-zinc-300'}>{value}</span></div>;
}