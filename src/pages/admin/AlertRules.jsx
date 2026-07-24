import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, Trash2, RotateCcw } from 'lucide-react';
import { SEV_STYLE } from '@/lib/dashboardFormat';

const DEFAULTS = [
  { rule_key: "cash_runway_low", title: "Cash Runway Low", severity: "critical", affected_metric: "cash_runway", threshold: 4, comparator: "lt", business_impact: "Insufficient operating cash.", recommended_action: "Arrange funding.", enabled: true },
  { rule_key: "labour_above_target", title: "Labour Cost Above Target", severity: "medium", affected_metric: "labour_cost_pct", threshold: 3500, comparator: "gt", business_impact: "Erodes EBITDA.", recommended_action: "Review roster.", enabled: true },
  { rule_key: "food_cost_above_target", title: "Food Cost Above Target", severity: "medium", affected_metric: "food_cost_pct", threshold: 3200, comparator: "gt", business_impact: "Reduces gross margin.", recommended_action: "Review wastage.", enabled: true },
  { rule_key: "owner_score_drop", title: "Owner Score Decline", severity: "high", affected_metric: "owner_score", threshold: 2, comparator: "gt", business_impact: "Health weakening.", recommended_action: "Address root drivers.", enabled: true },
  { rule_key: "connector_failure", title: "Connector Sync Failure", severity: "high", affected_metric: "connector", threshold: 0, comparator: "gt", business_impact: "Data freshness at risk.", recommended_action: "Retry sync.", enabled: true },
];

export default function AlertRules() {
  const [rules, setRules] = useState([]);
  const [orgId, setOrgId] = useState(null);
  const load = async () => { try { setRules(await base44.entities.AlertRule.list() || []); } catch { setRules([]); } };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);
  const seed = async () => { if (!orgId) return; for (const d of DEFAULTS) { try { await base44.entities.AlertRule.create({ ...d, organisation_id: orgId, sort_order: 0 }); } catch {} } load(); };
  const toggle = async (r) => { await base44.entities.AlertRule.update(r.id, { enabled: !r.enabled }); load(); };
  const del = async (r) => { await base44.entities.AlertRule.delete(r.id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Bell className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Alert Rules</h1>
        <button onClick={seed} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Seed defaults</button></div>
      <p className="text-sm text-zinc-500">Rule-based, deterministic. The alert engine evaluates these against Phase 05/06 outputs — no AI.</p>
      <Card><CardContent className="p-0">
        {rules.length === 0 ? <p className="text-sm text-zinc-600 p-6">No rules. Click "Seed defaults" to load the standard rule set.</p> : (
          <div className="divide-y divide-zinc-800/60">
            {rules.map((r) => { const s = SEV_STYLE[r.severity] || SEV_STYLE.medium; return (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                <div><p className="text-sm text-zinc-200 font-medium">{r.title}</p><p className="text-xs text-zinc-500">{r.affected_metric} {r.comparator} {r.threshold}</p></div>
                <span className={`text-xs px-2 py-0.5 rounded ${s.bg} ${s.text} ${s.border} border ml-2`}>{s.label}</span>
                <button onClick={() => toggle(r)} className={`ml-auto text-xs px-2 py-1 rounded border ${r.enabled ? "border-emerald-500/30 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}>{r.enabled ? "Enabled" : "Disabled"}</button>
                <button onClick={() => del(r)} className="text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            );})}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}