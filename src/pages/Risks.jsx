import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEV_STYLE, RISK_LIKELIHOOD_STYLE, fmtValue } from '@/lib/planningFormat';

export default function Risks() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); try { setData(await base44.functions.invoke("getRiskRegister", {})); } catch (e) { console.error(e); } setLoading(false); };
  useEffect(() => { load(); }, []);

  const risks = data?.risks || [];
  const updateStatus = async (r, status) => { await base44.entities.ExecutiveRisk.update(r.id, { status }); load(); };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Executive Risk Register</h1>
            <p className="text-xs text-zinc-500">Auto-generated from deterministic data · {risks.length} risks · {data?.rules_count} rules</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
        </div>

        {loading ? <Spinner /> : risks.length === 0 ? <p className="text-xs text-zinc-600 py-12 text-center">No risks detected. All metrics within thresholds.</p> : (
          <div className="space-y-3">
            {risks.map((r) => { const s = SEV_STYLE[r.severity] || SEV_STYLE.medium; const lk = RISK_LIKELIHOOD_STYLE[r.likelihood] || "text-zinc-400"; return (
              <div key={r.id} className={`rounded-xl border p-4 ${s.border} ${s.bg}`}>
                <div className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.dot} mt-1.5 shrink-0`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-zinc-100">{r.title}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${s.border} ${s.text}`}>{s.label}</span>
                      <span className={`text-[10px] ${lk}`}>likelihood: {r.likelihood}</span>
                      <span className="text-[10px] text-zinc-500">metric: {r.affected_metric}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{r.description}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 text-xs">
                      <div><p className="text-zinc-600">Impact estimate</p><p className="text-zinc-200 tabular-nums">{fmtValue(r.impact_cents, "cents")}</p></div>
                      <div><p className="text-zinc-600">Mitigation</p><p className="text-zinc-300">{r.mitigation || "—"}</p></div>
                      <div><p className="text-zinc-600">Review date</p><p className="text-zinc-300">{r.review_date || "—"}</p></div>
                    </div>
                    {r.recommended_action && <p className="text-[11px] text-amber-400/80 mt-2">→ {r.recommended_action}</p>}
                  </div>
                  <select value={r.status} onChange={(e) => updateStatus(r, e.target.value)} className="text-xs bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300 self-start">
                    {["open","mitigating","mitigated","closed","accepted"].map((s) => <option key={s} value={s}>{s}</option>)}
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