import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Building2, Plus, Trash2, Pencil } from 'lucide-react';

const STATUS = ['active','closed','opening'];

export default function AdminSites() {
  const [sites, setSites] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ organisation_id: '', name: '', address: '', state: '', postcode: '', contact_phone: '', contact_email: '', trading_hours: '', status: 'active' });

  const load = async () => {
    setLoading(true);
    try {
      const [s, o] = await Promise.all([base44.functions.invoke('getSites', {}), base44.functions.invoke('getOrganisations', {})]);
      setSites(s.sites || []); setOrgs(o.organisations || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.organisation_id) return;
    try {
      if (editId) await base44.functions.invoke('updateSite', { id: editId, ...form });
      else await base44.functions.invoke('createSite', form);
      reset(); load();
    } catch (e) { alert(e.message); }
  };
  const edit = (s) => { setEditId(s.id); setForm({ organisation_id: s.organisation_id, name: s.name, address: s.address || '', state: s.state || '', postcode: s.postcode || '', contact_phone: s.contact_phone || '', contact_email: s.contact_email || '', trading_hours: s.trading_hours || '', status: s.status || 'active' }); setShowForm(true); };
  const del = async (s) => {
    if (!confirm(`Delete ${s.name}?`)) return;
    try { const res = await base44.functions.invoke('deleteSite', { id: s.id }); alert(res.deleted ? 'Deleted' : `Closed: ${(res.blocking || []).join(', ')}`); load(); }
    catch (e) { alert(e.message); }
  };
  const reset = () => { setForm({ organisation_id: '', name: '', address: '', state: '', postcode: '', contact_phone: '', contact_email: '', trading_hours: '', status: 'active' }); setEditId(null); setShowForm(false); };

  const orgName = (id) => orgs.find((o) => o.id === id)?.name || id;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Sites</h1>
        <button onClick={() => { reset(); setShowForm(true); }} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button></div>
      <p className="text-sm text-zinc-500">Unlimited sites per organisation · address, contact, managers, cost centre, trading hours, default reporting rules.</p>

      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <F label="Organisation"><select value={form.organisation_id} onChange={(e) => setForm({ ...form, organisation_id: e.target.value })} className="inp">{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></F>
          <F label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="inp" /></F>
          <F label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="inp" /></F>
          <F label="State"><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="inp" /></F>
          <F label="Postcode"><input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} className="inp" /></F>
          <F label="Phone"><input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="inp" /></F>
          <F label="Email"><input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className="inp" /></F>
          <F label="Trading hours"><input value={form.trading_hours} onChange={(e) => setForm({ ...form, trading_hours: e.target.value })} className="inp" /></F>
          <F label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="inp">{STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select></F>
          <div className="flex items-end gap-2"><button onClick={save} className="text-sm px-4 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">{editId ? 'Update' : 'Create'}</button></div>
        </div>
      )}

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80"><tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
              <th className="px-3 py-2 font-medium">Site</th><th className="font-medium">Organisation</th><th className="font-medium">Location</th><th className="font-medium">Status</th><th className="font-medium w-20">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-800/60">
              {sites.map((s) => <tr key={s.id} className="hover:bg-zinc-800/30">
                <td className="px-3 py-2 text-zinc-200 font-medium">{s.name}</td>
                <td className="text-zinc-500">{orgName(s.organisation_id)}</td>
                <td className="text-zinc-500">{[s.suburb, s.state].filter(Boolean).join(' ') || '—'}</td>
                <td><span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{s.status}</span></td>
                <td className="space-x-1">
                  <button onClick={() => edit(s)} className="text-zinc-500 hover:text-amber-300"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => del(s)} className="text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
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