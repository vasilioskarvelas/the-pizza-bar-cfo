import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { GRANULARITY_OPTIONS } from '@/lib/forecastFormat';

export default function TimelineConfig() {
  const [defaultGranularity, setDefaultGranularity] = useState("monthly");
  const [defaultHorizon, setDefaultHorizon] = useState(6);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Calendar className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Timeline Configuration</h1></div>
      <p className="text-sm text-zinc-500">Presentation defaults for the Financial Timeline. All granularities are supported; monthly is the native data cadence (quarterly/yearly aggregate, daily/weekly bucket at period start).</p>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
        <label className="text-xs text-zinc-400 flex items-center gap-2">Default granularity
          <select value={defaultGranularity} onChange={(e)=>setDefaultGranularity(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200">
            {GRANULARITY_OPTIONS.map((g)=><option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400 flex items-center gap-2">Default forecast horizon (months)
          <input type="number" value={defaultHorizon} onChange={(e)=>setDefaultDefaultHorizon(Number(e.target.value))} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-24" />
        </label>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200 mb-2">Aggregation rules</h3>
        <ul className="text-xs text-zinc-400 space-y-1">
          <li>• Flow metrics (revenue, expenses, GST): <strong>summed</strong> across bucketed periods.</li>
          <li>• Stock metrics (cash, working capital, debt): <strong>averaged</strong> across bucketed periods.</li>
          <li>• Ratios &amp; scores (margin, runway, Owner Score): <strong>averaged</strong>.</li>
          <li>• Daily/weekly show monthly points at their period start (data cadence is monthly).</li>
        </ul>
      </div>
    </div>
  );
  function setDefaultDefaultHorizon(v){ setDefaultHorizon(v); }
}