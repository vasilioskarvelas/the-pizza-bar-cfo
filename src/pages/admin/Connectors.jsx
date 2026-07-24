import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Plug, Plus, RefreshCw, Power, PowerOff, Link2, Unlink } from 'lucide-react';

const SOURCE_SYSTEMS = ['xero', 'pos', 'payroll', 'banking', 'supplier_invoice', 'rostering', 'delivery', 'manual'];
const CONNECTOR_TYPES = ['oauth', 'api_key', 'manual', 'webhook'];

export default function Connectors() {
  const [connectors, setConnectors] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ name: '', source_system: 'xero', connector_type: 'manual', site_id: '', config: '{"simulated":true,"record_count":3}' });

  async function load() {
    setLoading(true);
    const [c, s] = await Promise.all([
      base44.entities.Connector.list(),
      base44.entities.Site.list(),
    ]);
    setConnectors(c || []);
    setSites(s || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setBusy('create');
    try {
      await base44.entities.Connector.create({
        organisation_id: connectors[0]?.organisation_id,
        site_id: form.site_id || null,
        source_system: form.source_system, name: form.name, connector_type: form.connector_type,
        status: 'active', config: form.config,
      });
      setForm({ ...form, name: '' });
      await load();
    } catch (e) { console.error(e); }
    setBusy(null);
  }
  async function setStatus(c, status) {
    await base44.entities.Connector.update(c.id, { status });
    await load();
  }
  async function sync(c) {
    setBusy(c.id);
    try { await base44.functions.invoke('runConnectorSync', { connector_id: c.id, trigger: 'manual' }); await load(); }
    catch (e) { console.error(e); }
    setBusy(null);
  }
  async function connectXero() {
    try {
      const res = await base44.functions.invoke('xeroAuth', { action: 'authorize' });
      if (res?.data?.authorize_url) window.open(res.data.authorize_url, '_blank');
    } catch (e) { console.error(e); }
  }
  async function disconnect(c) {
    setBusy(c.id);
    try { await base44.functions.invoke('xeroAuth', { action: 'disconnect', connector_id: c.id }); await load(); }
    catch (e) { console.error(e); }
    setBusy(null);
  }

  const statusColor = (s) => s === 'active' ? 'text-emerald-400 border-emerald-500/30' : s === 'disabled' ? 'text-zinc-500 border-zinc-600' : 'text-rose-400 border-rose-500/30';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Connectors</h1>
          <p className="text-sm text-zinc-500">Register, authenticate, enable/disable and sync data connectors. Xero first; the framework supports future sources without schema changes.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="w-4 h-4" /> Register connector</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Xero (simulated)" /></div>
          <div>
            <Label className="text-xs">Site (optional)</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })}>
              <option value="">Organisation-wide</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Source system</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.source_system} onChange={(e) => setForm({ ...form, source_system: e.target.value })}>
              {SOURCE_SYSTEMS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Connector type</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.connector_type} onChange={(e) => setForm({ ...form, connector_type: e.target.value })}>
              {CONNECTOR_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><Label className="text-xs">Config (JSON)</Label><Input value={form.config} onChange={(e) => setForm({ ...form, config: e.target.value })} /></div>
          <div className="sm:col-span-2 flex gap-2">
            <Button disabled={busy === 'create' || !form.name} onClick={create}><Plug className="w-4 h-4 mr-1" /> Register</Button>
            <Button variant="outline" onClick={connectXero}><Link2 className="w-4 h-4 mr-1" /> Connect real Xero (OAuth)</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : (
        <div className="space-y-2">
          {connectors.map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{c.name}</p>
                      <Badge variant="outline" className={`text-xs ${statusColor(c.status)}`}>{c.status}</Badge>
                      <Badge variant="outline" className="text-xs">{c.source_system} · {c.connector_type}</Badge>
                      {c.auth_ref && <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">authenticated</Badge>}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">Last run: {c.last_run_at ? new Date(c.last_run_at).toLocaleString('en-AU') : 'never'} · {c.last_run_status || '—'}</p>
                    <p className="text-xs text-zinc-500">Last successful sync: {c.last_successful_sync_at ? new Date(c.last_successful_sync_at).toLocaleString('en-AU') : 'never'}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" disabled={busy === c.id || c.status !== 'active'} onClick={() => sync(c)}><RefreshCw className={`w-3 h-3 mr-1 ${busy === c.id ? 'animate-spin' : ''}`} /> Sync now</Button>
                    {c.status === 'active'
                      ? <Button size="sm" variant="outline" className="text-amber-300" onClick={() => setStatus(c, 'disabled')}><PowerOff className="w-3 h-3 mr-1" /> Disable</Button>
                      : <Button size="sm" variant="outline" className="text-emerald-300" onClick={() => setStatus(c, 'active')}><Power className="w-3 h-3 mr-1" /> Enable</Button>}
                    {c.connector_type === 'oauth' && c.auth_ref && <Button size="sm" variant="outline" className="text-rose-300" disabled={busy === c.id} onClick={() => disconnect(c)}><Unlink className="w-3 h-3 mr-1" /> Disconnect</Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}