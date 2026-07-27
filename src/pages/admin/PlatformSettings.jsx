import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { SlidersHorizontal, Plus, Trash2 } from 'lucide-react';

export default function AdminPlatformSettings() {
  const [settings, setSettings] = useState([]);
  const [orgId, setOrgId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ setting_key: '', setting_value: '', category: 'general' });

  const load = async () => { try { setSettings(await base44.entities.PlatformSetting.list() || []); } catch { setSettings([]); } };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const create = async () => {
    if (!form.setting_key) return;
    try { await base44.entities.PlatformSetting.create({ ...form, organisation_id: orgId || null }); setForm({ setting_key: '', setting_value: '', category: 'general' }); setShowForm(false); load(); }
    catch (e) { alert(e.message); }
  };
  const toggle = async (s) => { await base44.entities.PlatformSetting.update(s.id, { enabled: !s.enabled }); load(); };
  const del = async (s) => { await base44.entities.PlatformSetting.delete(s.id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><SlidersHorizontal className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Platform Settings</h1>
        <button onClick={() => setShowForm((v) => !v)} className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button></div>
      <p className="text-sm text-zinc-500">Platform-wide and per-organisation configuration. Settings with no organisation_id apply globally.</p>

      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <F label="Key"><input value={form.setting_key} onChange={(e) => setForm({ ...form, setting_key: e.target.value })} className="inp" /></F>
          <F label="Value"><input value={form.setting_value} onChange={(e) => setForm({ ...form, setting_value: e.target.value })} className="inp" /></F>
          <F label="Category"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="inp" /></F>
          <div className="flex items-end"><button onClick={create} className="text-sm px-4 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">Create</button></div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800/60">
        {settings.length === 0 ? <p className="text-sm text-zinc-600 p-6">No platform settings.</p> :
          settings.map((s) => <div key={s.id} className="flex items-center gap-3 p-3">
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{s.category}</span>
            <span className="text-sm text-zinc-200 font-mono">{s.setting_key}</span>
            <span className="text-sm text-zinc-400">{s.setting_value}</span>
            {s.organisation_id && <span className="text-xs text-zinc-600">org-scoped</span>}
            <button onClick={() => toggle(s)} className={`ml-auto text-xs px-2 py-1 rounded border ${s.enabled ? 'border-emerald-500/30 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}>{s.enabled ? 'Enabled' : 'Disabled'}</button>
            <button onClick={() => del(s)} className="text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
          </div>)}
      </div>
      <style>{`.inp{background:#09090b;border:1px solid #27272a;border-radius:0.375rem;padding:0.375rem 0.5rem;font-size:0.875rem;width:100%}`}</style>
    </div>
  );
}
function F({ label, children }) { return <div><label className="text-xs text-zinc-500 block mb-1">{label}</label>{children}</div>; }