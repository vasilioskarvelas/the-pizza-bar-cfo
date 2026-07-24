import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Copy, Plus, Trash2, RefreshCw } from 'lucide-react';

export default function InitiativeTemplates() {
  const [items, setItems] = useState([]);
  const [orgId, setOrgId] = useState(null);

  const load = async () => { try { setItems(await base44.entities.InitiativeTemplate.list() || []); } catch { setItems([]); } };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const create = async () => { if (!orgId) return; await base44.entities.InitiativeTemplate.create({ organisation_id: orgId, template_key: "new_template", label: "New Template", default_effort: "medium", default_budget_cents: 0, default_roi_bps: 0, default_owner_score_impact: 0, default_cash_impact_cents: 0, enabled: true }); load(); };
  const upd = async (r, field, value) => { await base44.entities.InitiativeTemplate.update(r.id, { [field]: value }); load(); };
  const del = async (r) => { await base44.entities.InitiativeTemplate.delete(r.id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Copy className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Initiative Templates</h1>
        <button onClick={create} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button>
        <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /></button></div>
      <p className="text-sm text-zinc-500">Reusable templates for common initiatives with default budgets and impacts.</p>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-sm text-zinc-600 p-6 text-center">No templates.</p> : items.map((r) => (
          <div key={r.id} className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <div className="flex items-center gap-2">
              <input value={r.label} onChange={(e) => upd(r, "label", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-48" />
              <input value={r.template_key} onChange={(e) => upd(r, "template_key", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-400 w-40 font-mono" />
              <select value={r.default_effort} onChange={(e) => upd(r, "default_effort", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
              <button onClick={() => del(r)} className="ml-auto text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
            </div>
            <textarea value={r.description || ""} onChange={(e) => upd(r, "description", e.target.value)} rows={1} placeholder="description" className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
            <div className="grid grid-cols-4 gap-2 mt-2">
              <input type="number" value={r.default_budget_cents || 0} onChange={(e) => upd(r, "default_budget_cents", Number(e.target.value))} placeholder="budget" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
              <input type="number" value={r.default_roi_bps || 0} onChange={(e) => upd(r, "default_roi_bps", Number(e.target.value))} placeholder="roi bps" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
              <input type="number" value={r.default_cash_impact_cents || 0} onChange={(e) => upd(r, "default_cash_impact_cents", Number(e.target.value))} placeholder="cash impact" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
              <input type="number" value={r.default_owner_score_impact || 0} onChange={(e) => upd(r, "default_owner_score_impact", Number(e.target.value))} placeholder="score impact" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}