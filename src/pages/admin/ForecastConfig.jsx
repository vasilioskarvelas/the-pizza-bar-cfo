import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Gauge, Trash2, RotateCcw } from 'lucide-react';

export default function ForecastConfig() {
  const [status, setStatus] = useState(null);
  const [defaultHorizon, setDefaultHorizon] = useState(12);
  const load = async () => { try { setStatus(await base44.functions.invoke("getForecast", { horizon: 1 })); } catch { setStatus(null); } };
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Gauge className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Forecast Configuration</h1></div>
      <p className="text-sm text-zinc-500">Forecast engine configuration & status. Calculations remain deterministic — this configures presentation defaults only.</p>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
        <Row label="Engine version" value={status?.engine_version} />
        <Row label="Cache status" value={status?.cache?.reused ? "reused" : "fresh"} />
        <Row label="Cache hash" value={status?.cache?.hash} />
        <label className="text-xs text-zinc-400 flex items-center gap-2">Default horizon (months)
          <input type="number" value={defaultHorizon} onChange={(e)=>setDefaultHorizon(Number(e.target.value))} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-24" />
          <span className="text-xs text-zinc-600">Used by the dashboard forecast widget.</span>
        </label>
      </div>
      <p className="text-[11px] text-zinc-600">Per-metric growth assumptions are managed under "Forecast Assumptions". Timeline defaults under "Timeline Config".</p>
    </div>
  );
}
function Row({ label, value }) { return <div className="flex items-center gap-2 text-sm"><span className="text-zinc-500 w-40">{label}</span><span className="text-zinc-200 font-mono">{value || "—"}</span></div>; }