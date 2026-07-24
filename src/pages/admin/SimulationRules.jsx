import React from 'react';
import { Sliders } from 'lucide-react';
import { ADJUSTMENT_CATALOG } from '@/lib/forecastFormat';

export default function SimulationRules() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Sliders className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Simulation Rules</h1></div>
      <p className="text-sm text-zinc-500">The deterministic adjustment catalog available to the scenario builder & decision simulator. Every adjustment is applied to the forecast raw inputs, then the locked Phase 05 financial engine recomputes all figures and the locked Phase 06 engine recomputes the Owner Score.</p>
      <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/60">
        {ADJUSTMENT_CATALOG.map((a) => (
          <div key={a.type} className="p-3">
            <div className="flex items-center gap-2"><span className="text-sm text-zinc-200 font-medium">{a.label}</span><span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">{a.type}</span></div>
            <div className="flex flex-wrap gap-3 mt-1">
              {(a.fields||[]).map((f) => <span key={f.key} className="text-xs text-zinc-500">{f.label} <span className="text-zinc-600">(default {f.def})</span></span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}