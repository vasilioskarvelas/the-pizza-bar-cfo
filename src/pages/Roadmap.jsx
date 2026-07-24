import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Map, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RISK_INDICATOR_STYLE, GOAL_STATUS_STYLE, INITIATIVE_STATUS_STYLE, fmtValue } from '@/lib/planningFormat';

export default function Roadmap() {
  const [data, setData] = useState(null);
  const [view, setView] = useState("quarterly");
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); try { setData(await base44.functions.invoke("getRoadmap", { view })); } catch (e) { console.error(e); } setLoading(false); };
  useEffect(() => { load(); }, [view]);

  const blocks = data?.blocks || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Map className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Strategic Roadmap</h1>
            <p className="text-xs text-zinc-500">{view === "annual" ? "Annual" : "Quarterly"} planning view · milestones · dependencies</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <div className="flex gap-1">
            {[["quarterly","Quarterly"],["annual","Annual"]].map(([k,l]) => <button key={k} onClick={() => setView(k)} className={`text-xs px-3 py-1.5 rounded-lg ${view===k?"bg-amber-500/10 text-amber-300 border border-amber-500/20":"border border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>{l}</button>)}
          </div>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /></button>
        </div>

        {loading ? <Spinner /> : blocks.length === 0 ? <p className="text-xs text-zinc-600 py-12 text-center">No roadmap data. Create goals and initiatives with due dates.</p> : (
          <div className="space-y-3">
            {blocks.map((b) => {
              const ri = RISK_INDICATOR_STYLE[b.risk_indicator] || RISK_INDICATOR_STYLE.none;
              return (
                <div key={b.quarter} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-sm font-semibold text-zinc-100">{b.quarter}</h3>
                    <div className="flex gap-2 text-[11px] text-zinc-500">
                      <span>{b.summary.total} items</span>
                      <span className="text-emerald-400">{b.summary.completed} done</span>
                      <span className="text-sky-400">{b.summary.upcoming} upcoming</span>
                      <span className="text-orange-400">{b.summary.delayed} delayed</span>
                    </div>
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded border ${ri} border-current/20`}>risk: {b.risk_indicator}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      {b.goals.map((g) => { const st = GOAL_STATUS_STYLE[g.status] || GOAL_STATUS_STYLE.not_started; return (
                        <div key={g.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-zinc-800/40">
                          <span className={`w-1.5 h-1.5 rounded-full ${st.text.replace("text","bg")} shrink-0`} />
                          <span className="text-zinc-300 truncate">{g.title}</span>
                          <span className="text-zinc-600 ml-auto">{g.progress?.toFixed(0)}%</span>
                        </div>
                      );})}
                    </div>
                    <div className="space-y-1">
                      {b.initiatives.map((i) => { const st = INITIATIVE_STATUS_STYLE[i.status] || INITIATIVE_STATUS_STYLE.planned; return (
                        <div key={i.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-zinc-800/40">
                          <span className="text-zinc-500">▸</span>
                          <span className="text-zinc-300 truncate">{i.title}</span>
                          <span className={`ml-auto text-[10px] ${st.text}`}>{st.label}</span>
                        </div>
                      );})}
                      {b.milestones.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-zinc-800/20 border-l-2 border-amber-500/30">
                          <span className="text-amber-400">◆</span>
                          <span className="text-zinc-400 truncate">{m.title}</span>
                          <span className="text-zinc-600 ml-auto">{m.due || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }