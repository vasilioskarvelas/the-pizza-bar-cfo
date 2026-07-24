import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Spline, Plus, RefreshCw, Trash2 } from 'lucide-react';

const SOURCES = ['xero', 'pos', 'banking', 'payroll', 'supplier_invoice', 'rostering', 'delivery', 'manual'];
const CONFLICT = ['authoritative_wins', 'flag_exception', 'latest_wins'];

export default function SourceMapping() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ entity_type: 'invoice', authoritative_source: 'xero', secondary_sources: '', conflict_resolution: 'authoritative_wins', effective_from: '2026-07-01' });

  async function load() {
    setLoading(true);
    try {
      const r = await base44.entities.SourceAuthorityRule.list('-created_date', 100);
      setRules(r || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setBusy('create');
    try {
      const orgId = rules[0]?.organisation_id;
      if (!orgId) { setBusy(null); return; }
      const secondary = form.secondary_sources ? form.secondary_sources.split(',').map((s) => s.trim()).filter(Boolean) : [];
      await base44.entities.SourceAuthorityRule.create({
        organisation_id: orgId, entity_type: form.entity_type,
        authoritative_source: form.authoritative_source, secondary_sources: secondary,
        conflict_resolution: form.conflict_resolution, effective_from: form.effective_from,
      });
      setForm({ ...form, entity_type: '' });
      await load();
    } catch (e) { console.error(e); }
    setBusy(null);
  }
  async function remove(id) {
    await base44.entities.SourceAuthorityRule.delete(id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Source Mapping</h1>
          <p className="text-sm text-zinc-500">Source authority rules define which source system is authoritative for each entity type and how cross-source conflicts are resolved during reconciliation.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="w-4 h-4" /> Add authority rule</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div><Label className="text-xs">Entity type</Label><Input value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })} placeholder="invoice" /></div>
          <div>
            <Label className="text-xs">Authoritative source</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.authoritative_source} onChange={(e) => setForm({ ...form, authoritative_source: e.target.value })}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Secondary sources (comma-sep)</Label><Input value={form.secondary_sources} onChange={(e) => setForm({ ...form, secondary_sources: e.target.value })} placeholder="banking,pos" /></div>
          <div>
            <Label className="text-xs">Conflict resolution</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.conflict_resolution} onChange={(e) => setForm({ ...form, conflict_resolution: e.target.value })}>
              {CONFLICT.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Effective from</Label><Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></div>
          <div className="sm:col-span-3"><Button disabled={busy === 'create' || !form.entity_type} onClick={create}><Plus className="w-4 h-4 mr-1" /> Add rule</Button></div>
        </CardContent>
      </Card>

      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200 mb-3"><Spline className="w-4 h-4" /> Authority rules ({rules.length})</h2>
        {loading ? <p className="text-sm text-zinc-500">Loading…</p> : rules.length === 0 ? (
          <p className="text-sm text-zinc-600">No rules yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <Card key={r.id}><CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs font-mono">{r.entity_type}</Badge>
                  <span className="text-emerald-300">{r.authoritative_source}</span>
                  {(r.secondary_sources || []).length > 0 && <span className="text-zinc-500">+ {r.secondary_sources.join(', ')}</span>}
                  <Badge variant="outline" className="text-xs text-zinc-500">{r.conflict_resolution}</Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">from {r.effective_from}</span>
                  <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => remove(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}