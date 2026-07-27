import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Building2, Plus, Trash2, Pencil } from 'lucide-react';

const TYPES = ['independent','franchise_group','franchisee','subsidiary','practice','portfolio','holding'];

export default function AdminOrganisations() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', legal_name: '', trading_name: '', abn: '', organisation_type: 'independent', industry: '', timezone: 'Australia/Melbourne' });

  const load = async () => {
    setLoading(true);
    try { const res = await base44.functions.invoke('getOrganisations', {}); setOrgs(res.organisations || []); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) return;
    try {
      if (editId) await base44.functions.invoke('updateOrganisation', { id: editId, ...form });
      else await base44.functions.invoke('createOrganisation', form);
      setForm({ name: '', legal_name: '', trading_name: '', abn: '', organisation_type: 'independent', industry: '', timezone: 'Australia/Melbourne' });
      setEditId(null); setShowForm(false); load();
    } catch (e) { alert(e.message); }
  };
  const edit = (o) => { setEditId(o.id); setForm({ name: o.name, legal_name: o.legal_name || '', trading_name: o.trading_name || '', abn: o.abn || '', organisation_type: o.organisation_type || 'independent', industry: o.industry || '', timezone: o.timezone || 'Australia/Melbourne' }); setShowForm(true); };
  const del = async (o) => {
    if (!confirm(`Delete ${o.name}? Active sites/users/compliance will be suspended unless clear.`)) return;
    try { const res = await base44.functions.invoke('deleteOrganisation', { id: o.id }); alert(res.deleted ? 'Deleted' : `Suspended: ${(res.blocking || []).join(', ')}`); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Organisations</h1>
        <button onClick={() => { setEditId(null); setShowForm(true); }} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button></div>
      <p className="text-sm text-zinc-500">Multi-tenant: independent businesses, franchise groups, subsidiaries, practices and portfolios. Platform-admin managed.</p>

      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <F label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="inp" /></F>
          <F label="Legal name"><input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} className="inp" /></F>
          <F label="Trading name"><input value={form.trading_name} onChange={(e) => setForm({ ...form, trading_name: e.target.value })} className="inp" /></F>
          <F label="ABN"><input value={form.abn} onChange={(e) => setForm({ ...form, abn: e.target.value })} className="inp" /></F>
          <F label="Type"><select value={form.organisation_type} onChange={(e) => setForm({ ...form, organisation_type: e.target.value })} className="inp">{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></F>
          <F label="Industry"><input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="inp" /></F>
          <F label="Timezone"><input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="inp" /></F>
          <div className="flex items-end gap-2"><button onClick={save} className="text-sm px-4 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">{editId ? 'Update' : 'Create'}</button></div>
        </div>
      )}

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80"><tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
              <th className="px-3 py-2 font-medium">Name</th><th className="font-medium">Type</th><th className="font-medium">ABN</th><th className="font-medium">Status</th><th className="text-right font-medium">Sites</th><th className="font-medium w-20">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-800/60">
              {orgs.map((o) => <tr key={o.id} className="hover:bg-zinc-800/30">
                <td className="px-3 py-2 text-zinc-200 font-medium">{o.name}</td>
                <td className="text-zinc-500">{o.organisation_type}</td>
                <td className="text-zinc-500">{o.abn || '—'}</td>
                <td><span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{o.status}</span></td>
                <td className="text-right tabular-nums text-zinc-300">{o.site_count}</td>
                <td className="space-x-1">
                  <button onClick={() => edit(o)} className="text-zinc-500 hover:text-amber-300"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => del(o)} className="text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      <style>{`.inp{background:#09090b;border:1px solid #27272a;border-radius:0.375rem;padding:0.375rem 0.5rem;font-size:0.875rem;width:100%}`}</style>
    </div>
  );
}
function F({ label, children }) { return <div><label className="text-xs text-zinc-500 block mb-1">{label}</label>{children}</div>; }