import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { GitBranch, Plus, Trash2, Save, X, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import ScenarioEditor from '@/components/forecast/ScenarioEditor';
import ComparisonTable from '@/components/forecast/ComparisonTable';
import SimulationPanel from '@/components/forecast/SimulationPanel';

export default function Scenarios() {
  const [scenarios, setScenarios] = useState([]);
  const [editing, setEditing] = useState(null); // {id, name, description, status, horizon_months, adjustments, color}
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("manage");

  const load = async () => {
    try { const r = await base44.functions.invoke("createScenario", { action: "list" }); setScenarios(r.scenarios || []); } catch (e) { console.error(e); }
  };
  useEffect(() => { load(); }, []);

  const compare = async () => {
    setLoading(true);
    try { setComparison(await base44.functions.invoke("compareScenarios", { horizon: 12, include_all: true })); } catch (e) { console.error(e); }
    setLoading(false);
  };

  const startCreate = () => setEditing({ id: null, name: "New scenario", description: "", status: "draft", horizon_months: 12, adjustments: [], color: "amber" });
  const startEdit = (s) => setEditing({ id: s.id, name: s.name, description: s.description || "", status: s.status, horizon_months: s.horizon_months || 12, adjustments: s.adjustments || [], color: s.color || "amber" });
  const save = async () => {
    try {
      await base44.functions.invoke("createScenario", { action: editing.id ? "update" : "create", scenario_id: editing.id, name: editing.name, description: editing.description, status: editing.status, horizon_months: editing.horizon_months, adjustments: editing.adjustments, color: editing.color });
      setEditing(null); load();
    } catch (e) { console.error(e); }
  };
  const del = async (s) => { if (!confirm(`Delete "${s.name}"?`)) return; await base44.functions.invoke("deleteScenario", { scenario_id: s.id }); load(); };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><GitBranch className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Scenarios & Simulator</h1>
            <p className="text-xs text-zinc-500">Isolated what-if modelling · never affects live data · deterministic</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
        </div>

        <div className="flex gap-1 mb-4">
          {[["manage","Manage"],["compare","Compare"],["simulate","Simulate"]].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-xs ${tab===k?"bg-amber-500/10 text-amber-300 border border-amber-500/20":"border border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>{l}</button>
          ))}
        </div>

        {tab === "manage" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-zinc-200">Scenarios ({scenarios.length})</h3><button onClick={startCreate} className="ml-auto text-xs px-2 py-1 rounded border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button></div>
              {scenarios.length === 0 ? <p className="text-xs text-zinc-600 py-6 text-center">No scenarios. Click "New".</p> : scenarios.map((s) => (
                <div key={s.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-200 font-medium">{s.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.status==="active"?"bg-emerald-500/10 text-emerald-400":"bg-zinc-800 text-zinc-500"}`}>{s.status}</span>
                    <button onClick={() => startEdit(s)} className="ml-auto text-xs px-2 py-1 rounded border border-zinc-800 text-zinc-300 hover:text-amber-300">Edit</button>
                    <button onClick={() => del(s)} className="text-zinc-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">{s.description || "—"}</p>
                  <p className="text-[11px] text-zinc-600 mt-1">{(s.adjustments||[]).length} adjustment(s) · {s.horizon_months}m horizon</p>
                </div>
              ))}
            </div>
            <div>
              {editing ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                  <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-zinc-200">{editing.id ? "Edit" : "New"} scenario</h3>
                    <button onClick={save} className="ml-auto text-xs px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                    <button onClick={() => setEditing(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-zinc-400 flex flex-col gap-0.5">Name<input value={editing.name} onChange={(e)=>setEditing({...editing,name:e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" /></label>
                    <label className="text-xs text-zinc-400 flex flex-col gap-0.5">Status
                      <select value={editing.status} onChange={(e)=>setEditing({...editing,status:e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200">
                        <option value="draft">draft</option><option value="active">active</option><option value="archived">archived</option>
                      </select>
                    </label>
                  </div>
                  <label className="text-xs text-zinc-400 flex flex-col gap-0.5">Description<input value={editing.description} onChange={(e)=>setEditing({...editing,description:e.target.value})} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" /></label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-0.5">Horizon (months)<input type="number" value={editing.horizon_months} onChange={(e)=>setEditing({...editing,horizon_months:Number(e.target.value)})} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" /></label>
                  <ScenarioEditor adjustments={editing.adjustments} onChange={(a) => setEditing({...editing, adjustments: a})} />
                </div>
              ) : <p className="text-xs text-zinc-600 py-12 text-center">Select a scenario to edit, or click "New".</p>}
            </div>
          </div>
        )}

        {tab === "compare" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-amber-400" /><h3 className="text-sm font-semibold text-zinc-200">Scenario Comparison</h3>
              <button onClick={compare} disabled={loading} className="ml-auto text-xs px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">{loading ? "Comparing…" : "Run comparison"}</button></div>
            {comparison ? <ComparisonTable comparison={comparison.comparison} scenarios={comparison.scenarios} /> : <p className="text-xs text-zinc-600 py-8 text-center">Click "Run comparison" to compare all active scenarios vs baseline.</p>}
          </div>
        )}

        {tab === "simulate" && <SimulationPanel />}
      </div>
    </div>
  );
}