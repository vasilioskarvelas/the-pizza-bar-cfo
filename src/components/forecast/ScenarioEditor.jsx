import React, { useState } from 'react';
import { ADJUSTMENT_CATALOG } from '@/lib/forecastFormat';
import { Plus, Trash2, ChevronDown } from 'lucide-react';

// Build a scenario's adjustments array from the deterministic catalog.
export default function ScenarioEditor({ adjustments, onChange }) {
  const [picker, setPicker] = useState(false);
  const update = (next) => onChange(next);

  const add = (type) => {
    const def = ADJUSTMENT_CATALOG.find((a) => a.type === type);
    const adj = { type };
    (def.fields || []).forEach((f) => { adj[f.key] = f.def; });
    update([...(adjustments || []), adj]);
    setPicker(false);
  };

  const setField = (idx, key, val) => {
    const next = adjustments.map((a, i) => i === idx ? { ...a, [key]: val } : a);
    update(next);
  };
  const remove = (idx) => update(adjustments.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Adjustments ({adjustments?.length || 0})</span>
        <button onClick={() => setPicker((v) => !v)} className="ml-auto text-xs px-2 py-1 rounded border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
      </div>
      {picker && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 grid grid-cols-2 gap-1 max-h-48 overflow-auto">
          {ADJUSTMENT_CATALOG.map((a) => (
            <button key={a.type} onClick={() => add(a.type)} className="text-left text-xs px-2 py-1.5 rounded hover:bg-zinc-800 text-zinc-300">{a.label}</button>
          ))}
        </div>
      )}
      {(adjustments || []).map((a, idx) => {
        const def = ADJUSTMENT_CATALOG.find((x) => x.type === a.type) || { label: a.type, fields: [] };
        return (
          <div key={idx} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-amber-300">{def.label}</span>
              <button onClick={() => remove(idx)} className="ml-auto text-zinc-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {(def.fields || []).map((f) => (
                <label key={f.key} className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-zinc-600">{f.label}</span>
                  <input type="number" step="any" value={a[f.key]} onChange={(e) => setField(idx, f.key, Number(e.target.value))} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200" />
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {(!adjustments || adjustments.length === 0) && <p className="text-xs text-zinc-600">No adjustments — this is the baseline.</p>}
    </div>
  );
}