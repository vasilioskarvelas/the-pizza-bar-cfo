import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { SlidersHorizontal, Trash2, Plus } from 'lucide-react';

const DEFAULT_METRICS = ["revenue","cogs","labour_cost","operating_expenses","cash","long_term_debt","net_gst_position","owner_score"];

export default function ForecastAssumptions() {
  const [list, setList] = useState([]);
  const [orgId, setOrgId] = useState(null);
  const [draft, setDraft] = useState({ metric_code: "revenue", label: "", growth_bps: 0, method: "auto", notes: "" });

  const load = async () => { try { setList(await base44.entities.ForecastAssumption.list() || []); } catch { setList([]); } };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const create = async () => {
    if (!orgId) return;
    try { await base44.entities.ForecastAssumption.create({ ...draft, organisation_id: orgId, label: draft.label || draft.metric_code, enabled: true }); setDraft({ metric_code: "revenue", label: "", growth_bps: 0, method: "auto", notes: "" }); load(); } catch (e) { console.error(e); }
  };
  const upd = async (a, field, val) => { try { await base44.entities.ForecastAssumption.update(a.id, { [field]: val }); load(); } catch {} };
  const del = async (a) => { await base44.entities.ForecastAssumption.delete(a.id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><SlidersHorizontal className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Forecast Assumptions</h1></div>
      <p className="text-sm text-zinc-500">Per-metric annual growth assumptions (bps) driving the forecast engine. "auto" uses trend (≥3 pts) then flat; "assumption" applies the configured growth; "flat" holds last value.</p>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 grid grid-cols-2 lg:grid-cols-5 gap-2 items-end">
        <label className="text-xs text-zinc-400 flex flex-col gap-0.5">Metric
          <select value={draft.metric_code} onChange={(e)=>setDraft({...draft,metric_code:e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200">
            {DEFAULT_METRICS.map((m)=><option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400 flex flex-col gap-0.5">Label<input value={draft.label} onChange={(e)=>setDraft({...draft,label:e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" /></label>
        <label className="text-xs text-zinc-400 flex flex-col gap-0.5">Growth (bps/yr)<input type="number" value={draft.growth_bps} onChange={(e)=>setDraft({...draft,growth_bps:Number(e.target.value)})} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" /></label>
        <label className="text-xs text-zinc-400 flex flex-col gap-0.5">Method
          <select value={draft.method} onChange={(e)=>setDraft({...draft,method:e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200">
            {["auto","trend","flat","assumption"].map((m)=><option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <button onClick={create} className="text-xs px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1 justify-center"><Plus className="w-3 h-3" /> Add</button>
      </div>

      <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/60">
        {list.length === 0 ? <p className="text-sm text-zinc-600 p-4 text-center">No assumptions configured. Forecasts default to trend-then-flat.</p> : list.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-3">
            <span className="text-xs font-mono text-amber-300">{a.metric_code}</span>
            <span className="text-sm text-zinc-300">{a.label}</span>
            <input type="number" defaultValue={a.growth_bps} onBlur={(e)=>upd(a,"growth_bps",Number(e.target.value))} className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-xs text-zinc-200" />
            <span className="text-xs text-zinc-500">bps/yr</span>
            <select defaultValue={a.method} onBlur={(e)=>upd(a,"method",e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-xs text-zinc-200">
              {["auto","trend","flat","assumption"].map((m)=><option key={m} value={m}>{m}</option>)}
            </select>
            <button onClick={()=>del(a)} className="ml-auto text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}