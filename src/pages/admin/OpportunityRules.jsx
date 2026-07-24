import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Lightbulb, Plus, Trash2, RefreshCw } from 'lucide-react';

export default function OpportunityRules() {
  const [rules, setRules] = useState([]);
  const [orgId, setOrgId] = useState(null);

  const load = async () => { try { setRules(await base44.entities.OpportunityRule.list() || []); } catch { setRules([]); } };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const create = async () => { if (!orgId) return; await base44.entities.OpportunityRule.create({ organisation_id: orgId, rule_key: "new_rule", title: "New Rule", affected_metric: "revenue", threshold: 0, comparator: "gt", default_effort: "medium", owner_score_impact: 0, enabled: true, sort_order: 0 }); load(); };
  const upd = async (r, field, value) => { await base44.entities.OpportunityRule.update(r.id, { [field]: value }); load(); };
  const del = async (r) => { await base44.entities.OpportunityRule.delete(r.id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Opportunity Rules</h1>
        <button onClick={create} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button>
        <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /></button></div>
      <p className="text-sm text-zinc-500">Deterministic opportunity rules. Impact formulas estimate financial uplift from current metrics.</p>
      <div className="space-y-2">
        {rules.length === 0 ? <p className="text-sm text-zinc-600 p-6 text-center">No rules. Open the Opportunity Register page to auto-seed defaults.</p> : rules.map((r) => (
          <div key={r.id} className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <div className="flex items-center gap-2">
              <input value={r.title} onChange={(e) => upd(r, "title", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-48" />
              <input value={r.rule_key} onChange={(e) => upd(r, "rule_key", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-400 w-40 font-mono" />
              <input value={r.category || ""} onChange={(e) => upd(r, "category", e.target.value)} placeholder="category" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-28" />
              <select value={r.default_effort} onChange={(e) => upd(r, "default_effort", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
              <button onClick={() => upd(r, "enabled", !r.enabled)} className={`text-xs px-2 py-1 rounded border ${r.enabled ? "border-emerald-500/30 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}>{r.enabled ? "On" : "Off"}</button>
              <button onClick={() => del(r)} className="ml-auto text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <input value={r.affected_metric} onChange={(e) => upd(r, "affected_metric", e.target.value)} placeholder="metric" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
              <select value={r.comparator} onChange={(e) => upd(r, "comparator", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200">{["lt","lte","gt","gte","eq"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
              <input type="number" value={r.threshold} onChange={(e) => upd(r, "threshold", Number(e.target.value))} placeholder="threshold" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
              <input value={r.impact_formula || ""} onChange={(e) => upd(r, "impact_formula", e.target.value)} placeholder="impact formula" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input type="number" value={r.owner_score_impact || 0} onChange={(e) => upd(r, "owner_score_impact", Number(e.target.value))} placeholder="score impact" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
              <textarea value={r.recommended_action || ""} onChange={(e) => upd(r, "recommended_action", e.target.value)} rows={1} placeholder="recommended action" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}