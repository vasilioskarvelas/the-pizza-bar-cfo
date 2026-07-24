import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { FileText, Plus, Trash2, RefreshCw } from 'lucide-react';

export default function ReportTemplates() {
  const [items, setItems] = useState([]);
  const [orgId, setOrgId] = useState(null);

  const load = async () => { try { setItems(await base44.entities.ExecutiveReportTemplate.list() || []); } catch { setItems([]); } };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const create = async () => { if (!orgId) return; await base44.entities.ExecutiveReportTemplate.create({ organisation_id: orgId, template_key: "new_template", label: "New Report Template", format: "full", frequency: "ad_hoc", enabled: true }); load(); };
  const upd = async (r, field, value) => { await base44.entities.ExecutiveReportTemplate.update(r.id, { [field]: value }); load(); };
  const del = async (r) => { await base44.entities.ExecutiveReportTemplate.delete(r.id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Report Templates</h1>
        <button onClick={create} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button>
        <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /></button></div>
      <p className="text-sm text-zinc-500">Templates for the executive report generator (sections stored as JSON).</p>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-sm text-zinc-600 p-6 text-center">No templates. The report generator works without templates using the full format.</p> : items.map((r) => (
          <div key={r.id} className="flex items-center gap-2 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <input value={r.label} onChange={(e) => upd(r, "label", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-48" />
            <input value={r.template_key} onChange={(e) => upd(r, "template_key", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-400 w-40 font-mono" />
            <select value={r.format} onChange={(e) => upd(r, "format", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200">{["full","executive_summary","board","financial_only","scorecard"].map((f) => <option key={f} value={f}>{f}</option>)}</select>
            <select value={r.frequency} onChange={(e) => upd(r, "frequency", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200">{["ad_hoc","weekly","monthly","quarterly","annual"].map((f) => <option key={f} value={f}>{f}</option>)}</select>
            <button onClick={() => del(r)} className="ml-auto text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}