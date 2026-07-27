import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';

const DEFAULTS = [
  { category_key: 'bas', label: 'BAS', retention_days: 2555 },
  { category_key: 'tax_return', label: 'Tax Return', retention_days: 3650 },
  { category_key: 'financial_statement', label: 'Financial Statement', retention_days: 2555 },
  { category_key: 'insurance', label: 'Insurance', retention_days: 2555 },
  { category_key: 'lease', label: 'Lease', retention_days: 3650 },
  { category_key: 'contract', label: 'Contract', retention_days: 3650 },
  { category_key: 'policy', label: 'Policy', retention_days: 3650 },
  { category_key: 'licence', label: 'Licence', retention_days: 2555 },
  { category_key: 'certificate', label: 'Certificate', retention_days: 2555 },
];

export default function AdminDocumentCategories() {
  const [cats, setCats] = useState([]);
  const [orgId, setOrgId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category_key: '', label: '', retention_days: 2555 });

  const load = async () => { try { setCats(await base44.entities.DocumentCategory.list() || []); } catch { setCats([]); } };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const seed = async () => { if (!orgId) return; for (const d of DEFAULTS) { try { await base44.entities.DocumentCategory.create({ ...d, organisation_id: orgId }); } catch {} } load(); };
  const create = async () => {
    if (!form.category_key || !form.label || !orgId) return;
    try { await base44.entities.DocumentCategory.create({ ...form, organisation_id: orgId }); setForm({ category_key: '', label: '', retention_days: 2555 }); setShowForm(false); load(); }
    catch (e) { alert(e.message); }
  };
  const del = async (c) => { await base44.entities.DocumentCategory.delete(c.id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><FolderOpen className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Document Categories</h1>
        <button onClick={seed} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Seed defaults</button>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button></div>
      <p className="text-sm text-zinc-500">Categories governing the Document Vault — retention periods per category (BAS, tax returns, financial statements, insurance, leases, contracts, policies, licences, certificates).</p>

      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <F label="Key"><input value={form.category_key} onChange={(e) => setForm({ ...form, category_key: e.target.value })} className="inp" /></F>
          <F label="Label"><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="inp" /></F>
          <F label="Retention (days)"><input type="number" value={form.retention_days} onChange={(e) => setForm({ ...form, retention_days: Number(e.target.value) })} className="inp" /></F>
          <div className="flex items-end"><button onClick={create} className="text-sm px-4 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">Create</button></div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800/60">
        {cats.length === 0 ? <p className="text-sm text-zinc-600 p-6">No categories. Click "Seed defaults".</p> :
          cats.map((c) => <div key={c.id} className="flex items-center gap-3 p-3">
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{c.category_key}</span>
            <span className="text-sm text-zinc-200">{c.label}</span>
            <span className="text-xs text-zinc-500 ml-2">retention {c.retention_days} days</span>
            <button onClick={() => del(c)} className="ml-auto text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
          </div>)}
      </div>
      <style>{`.inp{background:#09090b;border:1px solid #27272a;border-radius:0.375rem;padding:0.375rem 0.5rem;font-size:0.875rem;width:100%}`}</style>
    </div>
  );
}
function F({ label, children }) { return <div><label className="text-xs text-zinc-500 block mb-1">{label}</label>{children}</div>; }