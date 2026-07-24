import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ShieldAlert, Plus, Trash2, RefreshCw } from 'lucide-react';
import { SEV_STYLE } from '@/lib/dashboardFormat';

export default function RiskRules() {
  const [rules, setRules] = useState([]);
  const [orgId, setOrgId] = useState(null);

  const load = async () => { try { setRules(await base44.entities.RiskRule.list() || []); } catch { setRules([]); } };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const create = async () => { if (!orgId) return; await base44.entities.RiskRule.create({ organisation_id: orgId, rule_key: "new_rule", title: "New Rule", severity: "medium", affected_metric: "revenue", threshold: 0, comparator: "lt", enabled: true, sort_order: 0 }); load(); };
  const upd = async (r, field, value) => { await base44.entities.RiskRule.update(r.id, { [field]: value }); load(); };
  const del = async (r) => { await base44.entities.RiskRule.delete(r.id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Risk Rules</h1>
        <button onClick={create} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button>
        <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /></button></div>
      <p className="text-sm text-zinc-500">Deterministic risk rules evaluated against current metrics. Impact formulas reference metric codes (e.g. <code className="text-amber-400">revenue * (labour_cost_pct - 3500) / 10000</code>).</p>
      <div className="space-y-2">
        {rules.length === 0 ? <p className="text-sm text-zinc-600 p-6 text-center">No rules. Open the Risk Register page to auto-seed defaults.</p> : rules.map((r) => { const s = SEV_STYLE[r.severity] || SEV_STYLE.medium; return (
          <div key={r.id} className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              <input value={r.title} onChange={(e) => upd(r, "title", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-48" />
              <input value={r.rule_key} onChange={(e) => upd(r, "rule_key", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-400 w-40 font-mono" />
              <select value={r.severity} onChange={(e) => upd(r, "severity", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200">{["critical","high","medium","low"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
              <button onClick={() => upd(r, "enabled", !r.enabled)} className={`text-xs px-2 py-1 rounded border ${r.enabled ? "border-emerald-500/30 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}>{r.enabled ? "On" : "Off"}</button>
              <button onClick={() => del(r)} className="ml-auto text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <input value={r.affected_metric} onChange={(e) => upd(r, "affected_metric", e.target.value)} placeholder="metric" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
              <select value={r.comparator} onChange={(e) => upd(r, "comparator", e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200">{["lt","lte","gt","gte","eq"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
              <input type="number" value={r.threshold} onChange={(e) => upd(r, "threshold", Number(e.target.value))} placeholder="threshold" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
              <input value={r.impact_formula || ""} onChange={(e) => upd(r, "impact_formula", e.target.value)} placeholder="impact formula" className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 font-mono" />
            </div>
            <textarea value={r.recommended_action || ""} onChange={(e) => upd(r, "recommended_action", e.target.value)} rows={1} placeholder="recommended action" className="mt-2 w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
          </div>
        );})}
      </div>
    </div>
  );
}