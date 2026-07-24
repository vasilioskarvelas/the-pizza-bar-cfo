import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RefreshCw, CheckCircle2, Filter } from 'lucide-react';

const TYPE_LABEL = {
  missing: 'Missing mapping/data', duplicate: 'Duplicate', amount_mismatch: 'Amount mismatch',
  unmatched: 'Unmatched', stale: 'Date mismatch', broken_link: 'Account/currency mismatch',
};
const sevColor = (s) =>
  s === 'critical' ? 'text-rose-400 border-rose-500/30'
  : s === 'warning' ? 'text-amber-400 border-amber-500/30'
  : 'text-sky-400 border-sky-500/30';

export default function Exceptions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [userId, setUserId] = useState(null);
  const [filter, setFilter] = useState({ resolved: 'all', type: 'all' });

  async function load() {
    setLoading(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      if (me) setUserId(me.id);
      const list = await base44.entities.ReconciliationException.list('-created_date', 100);
      setItems(list || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function resolve(item) {
    const note = window.prompt('Resolution note (review disposition):', 'Reviewed and accepted');
    if (note === null) return;
    setBusy(item.id);
    try {
      await base44.entities.ReconciliationException.update(item.id, {
        resolved: true, resolved_by: userId, resolved_at: new Date().toISOString(),
        resolution_note: note,
      });
      await load();
    } catch (e) { console.error(e); }
    setBusy(null);
  }

  const filtered = items.filter((i) =>
    (filter.resolved === 'all' || (filter.resolved === 'open' ? !i.resolved : i.resolved)) &&
    (filter.type === 'all' || i.exception_type === filter.type)
  );
  const open = items.filter((i) => !i.resolved).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Reconciliation Exceptions</h1>
          <p className="text-sm text-zinc-500">Detected mismatches are reviewable but not editable — only a review disposition is recorded. Corrections generate new reconciliation runs; the original exception is immutable evidence.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        <Filter className="w-4 h-4 text-zinc-500" />
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filter.resolved} onChange={(e) => setFilter({ ...filter, resolved: e.target.value })}>
          <option value="all">All states</option>
          <option value="open">Open ({open})</option>
          <option value="resolved">Resolved</option>
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
          <option value="all">All types</option>
          {Object.keys(TYPE_LABEL).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <Badge variant="outline" className="text-xs">{filtered.length} shown</Badge>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : filtered.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-sm text-zinc-600 flex flex-col items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-zinc-700" /> No exceptions match the filter.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => (
            <Card key={i.id}><CardContent className="pt-4 text-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs ${sevColor(i.severity)}`}>{i.severity}</Badge>
                  <Badge variant="outline" className="text-xs">{TYPE_LABEL[i.exception_type] || i.exception_type}</Badge>
                  {i.resolved
                    ? <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />resolved</Badge>
                    : <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">open</Badge>}
                </div>
                {!i.resolved && <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => resolve(i)}>Resolve (review)</Button>}
              </div>
              <p className="mt-2 text-zinc-300">{i.description}</p>
              <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-500 font-mono">
                {i.expected_value != null && <span>expected: {i.expected_value}</span>}
                {i.actual_value != null && <span>actual: {i.actual_value}</span>}
                {i.difference != null && <span>diff: {i.difference}</span>}
                <span>source: {i.source_record_id?.slice(-8) || '—'}</span>
              </div>
              {i.resolution_note && <p className="mt-1 text-xs text-emerald-400/80">Note: {i.resolution_note}</p>}
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}