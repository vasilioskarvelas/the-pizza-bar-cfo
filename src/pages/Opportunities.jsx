import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PRIORITY_STYLE, EFFORT_STYLE, fmtValue } from '@/lib/planningFormat';

export default function Opportunities() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); try { setData(await base44.functions.invoke("getOpportunityRegister", {})); } catch (e) { console.error(e); } setLoading(false); };
  useEffect(() => { load(); }, []);

  const opps = data?.opportunities || [];
  const totalImpact = opps.reduce((s, o) => s + (o.financial_impact_cents || 0), 0);
  const updateStatus = async (o, status) => { await base44.entities.Opportunity.update(o.id, { status }); load(); };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Lightbulb className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Opportunity Register</h1>
            <p className="text-xs text-zinc-500">{opps.length} opportunities · total est. impact {fmtValue(totalImpact, "cents")}</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
        </div>

        {loading ? <Spinner /> : opps.length === 0 ? <p className="text-xs text-zinc-600 py-12 text-center">No opportunities identified. All metrics at or above target.</p> : (
          <div className="space-y-3">
            {opps.map((o) => { const pr = PRIORITY_STYLE[o.priority] || PRIORITY_STYLE.medium; const ef = EFFORT_STYLE[o.implementation_effort] || "text-zinc-400"; return (
              <div key={o.id} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-zinc-100">{o.title}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${pr}`}>{o.priority}</span>
                      <span className={`text-[10px] ${ef}`}>effort: {o.implementation_effort}</span>
                      <span className="text-[10px] text-zinc-500">{o.category}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{o.description}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
                      <div><p className="text-zinc-600">Financial impact</p><p className="text-emerald-400 font-medium tabular-nums">{fmtValue(o.financial_impact_cents, "cents")}</p></div>
                      <div><p className="text-zinc-600">Score impact</p><p className="text-zinc-200">+{o.owner_score_impact}</p></div>
                      <div><p className="text-zinc-600">Metric</p><p className="text-zinc-300">{o.affected_metric}</p></div>
                    </div>
                    {o.recommended_action && <p className="text-[11px] text-emerald-400/80 mt-2">→ {o.recommended_action}</p>}
                  </div>
                  <select value={o.status} onChange={(e) => updateStatus(o, e.target.value)} className="text-xs bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300 self-start">
                    {["identified","evaluating","approved","in_progress","realised","rejected"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }