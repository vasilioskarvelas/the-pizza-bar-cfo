import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Layers, Plus, Trash2, RefreshCw } from 'lucide-react';

export default function GoalCategories() {
  const [items, setItems] = useState([]);
  const [orgId, setOrgId] = useState(null);

  const load = async () => { try { setItems(await base44.entities.GoalCategory.list() || []); } catch { setItems([]); } };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const create = async () => { if (!orgId) return; await base44.entities.GoalCategory.create({ organisation_id: orgId, category_key: "new_category", label: "New Category", default_direction: "maximize", default_unit: "cents", sort_order: 0, enabled: true }); load(); };
  const upd = async (r, field, value) => { await base44.entities.GoalCategory.update(r.id, { [field]: value }); load(); };
  const del = async (r) => { await base44.entities.GoalCategory.delete(r.id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Layers className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Goal Categories</h1>
        <button onClick={create} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button>
        <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /></button></div>
      <p className="text-sm text-zinc-500">Configure goal categories and their default direction/unit/metric links.</p>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-sm text-zinc-600 p-6 text-center">No categories. Categories auto-map from the goal category enum — add custom ones here.</p> : items.map((r) => (
          <div key={r.id} className="flex items-center gap-2 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <input value={r.label} onChange={(e) => upd(r, "label", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-40" />
            <input value={r.category_key} onChange={(e) => upd(r, "category_key", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-400 w-40 font-mono" />
            <select value={r.default_direction} onChange={(e) => upd(r, "default_direction", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200"><option value="maximize">maximize</option><option value="minimize">minimize</option></select>
            <input value={r.default_unit || ""} onChange={(e) => upd(r, "default_unit", e.target.value)} placeholder="unit" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-24" />
            <input value={r.linked_kpi_code || ""} onChange={(e) => upd(r, "linked_kpi_code", e.target.value)} placeholder="kpi code" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-28" />
            <button onClick={() => del(r)} className="ml-auto text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}