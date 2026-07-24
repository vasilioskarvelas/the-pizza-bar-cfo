import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { GitBranch } from 'lucide-react';

export default function ScenarioManagement() {
  const [list, setList] = useState([]);
  const load = async () => { try { const r = await base44.functions.invoke("createScenario", { action: "list" }); setList(r.scenarios || []); } catch {} };
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><GitBranch className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Scenario Management</h1>
        <Link to="/scenarios" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Open scenario builder →</Link></div>
      <p className="text-sm text-zinc-500">Scenarios are isolated what-if models. They never affect live financial data.</p>
      <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/60">
        {list.length === 0 ? <p className="text-sm text-zinc-600 p-4 text-center">No scenarios.</p> : list.map((s) => (
          <div key={s.id} className="flex items-center gap-3 p-3">
            <span className="text-sm text-zinc-200">{s.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.status==="active"?"bg-emerald-500/10 text-emerald-400":"bg-zinc-800 text-zinc-500"}`}>{s.status}</span>
            <span className="text-xs text-zinc-500 ml-auto">{(s.adjustments||[]).length} adjustment(s) · {s.horizon_months}m</span>
          </div>
        ))}
      </div>
    </div>
  );
}