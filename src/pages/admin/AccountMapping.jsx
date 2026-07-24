import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BookMarked, Plus, RefreshCw, Trash2 } from 'lucide-react';

const SOURCES = ['xero', 'pos', 'banking', 'payroll', 'supplier_invoice', 'rostering', 'delivery', 'manual'];

export default function AccountMapping() {
  const [mappings, setMappings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ source_system: 'xero', external_category: 'ACCREC', account_id: '', effective_from: '2026-07-01' });

  async function load() {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([
        base44.entities.AccountMapping.list('-created_date', 100),
        base44.entities.Account.list(),
      ]);
      setMappings(m || []);
      setAccounts(a || []);
      if (a && a[0] && !form.account_id) setForm((f) => ({ ...f, account_id: a[0].id }));
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setBusy('create');
    try {
      const orgId = mappings[0]?.organisation_id || accounts[0]?.organisation_id;
      await base44.entities.AccountMapping.create({ ...form, organisation_id: orgId });
      setForm({ ...form, external_category: '' });
      await load();
    } catch (e) { console.error(e); }
    setBusy(null);
  }
  async function remove(id) {
    await base44.entities.AccountMapping.delete(id);
    await load();
  }

  const accountLabel = (id) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.code} · ${a.name}` : id;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Account Mapping</h1>
          <p className="text-sm text-zinc-500">Map each source system's external category to a canonical Account. The canonical builder uses these mappings to classify transactions and derive GST treatment.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="w-4 h-4" /> Add mapping</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs">Source system</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.source_system} onChange={(e) => setForm({ ...form, source_system: e.target.value })}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">External category</Label><Input value={form.external_category} onChange={(e) => setForm({ ...form, external_category: e.target.value })} placeholder="ACCREC" /></div>
          <div>
            <Label className="text-xs">Canonical account</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Effective from</Label><Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></div>
          <div className="sm:col-span-4"><Button disabled={busy === 'create' || !form.external_category || !form.account_id} onClick={create}><Plus className="w-4 h-4 mr-1" /> Add mapping</Button></div>
        </CardContent>
      </Card>

      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200 mb-3"><BookMarked className="w-4 h-4" /> Chart of accounts ({accounts.length})</h2>
        <div className="flex flex-wrap gap-2 mb-6">
          {accounts.map((a) => (
            <Badge key={a.id} variant="outline" className="text-xs font-mono">{a.code} · {a.name} <span className="text-zinc-600 ml-1">{a.class}</span></Badge>
          ))}
          {accounts.length === 0 && <span className="text-sm text-zinc-600">No accounts defined.</span>}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-zinc-200 mb-3">Mappings ({mappings.length})</h2>
        {loading ? <p className="text-sm text-zinc-500">Loading…</p> : mappings.length === 0 ? (
          <p className="text-sm text-zinc-600">No mappings yet.</p>
        ) : (
          <div className="space-y-2">
            {mappings.map((m) => (
              <Card key={m.id}><CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{m.source_system}</Badge>
                  <span className="font-mono text-zinc-300">{m.external_category}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-zinc-300">{accountLabel(m.account_id)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">from {m.effective_from}{m.effective_to ? ` → ${m.effective_to}` : ''}</span>
                  <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => remove(m.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}