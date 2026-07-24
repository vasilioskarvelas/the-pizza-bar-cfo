import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Target, Plus, Trash2, Save, X, RefreshCw, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GOAL_CATEGORY_LABELS, GOAL_STATUS_STYLE, fmtValue } from '@/lib/planningFormat';
import { PRIORITY_STYLE } from '@/lib/forecastFormat';

const CATS = Object.keys(GOAL_CATEGORY_LABELS);

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const r = await base44.functions.invoke("getExecutiveGoals", {}); setGoals(r.goals || []); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const startCreate = () => setEditing({ id: null, title: "", description: "", category: "revenue", target_value: 0, baseline_value: 0, start_date: new Date().toISOString().slice(0, 10), end_date: "", priority: "medium", direction: "maximize", linked_kpi_code: "", notes: "" });
  const startEdit = (g) => setEditing({ id: g.id, title: g.title, description: g.description || "", category: g.category, target_value: g.target_value, baseline_value: g.baseline_value, start_date: g.start_date, end_date: g.end_date, priority: g.priority, direction: g.direction, linked_kpi_code: g.linked_kpi_code || "", notes: g.notes || "" });
  const save = async () => {
    try {
      await base44.functions.invoke("createGoal", { action: editing.id ? "update" : "create", goal_id: editing.id, ...editing });
      setEditing(null); load();
    } catch (e) { console.error(e); }
  };
  const del = async (g) => { if (!confirm(`Delete "${g.title}"?`)) return; await base44.functions.invoke("createGoal", { action: "delete", goal_id: g.id }); load(); };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Target className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Executive Goals</h1>
            <p className="text-xs text-zinc-500">Strategic targets · deterministic progress + forecast · {goals.length} goals</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
          <button onClick={startCreate} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New Goal</button>
        </div>

        {loading ? <Spinner /> : goals.length === 0 && !editing ? (
          <EmptyState onCreate={startCreate} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-3">
              {goals.map((g) => { const st = GOAL_STATUS_STYLE[g.status] || GOAL_STATUS_STYLE.not_started; const pr = PRIORITY_STYLE[g.priority] || PRIORITY_STYLE.medium; const f = g.forecast || {}; return (
                <div key={g.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-zinc-100">{g.title}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.bg} ${st.text} ${st.border}`}>{st.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${pr}`}>{g.priority}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{GOAL_CATEGORY_LABELS[g.category]}</span>
                      </div>
                      {g.description && <p className="text-xs text-zinc-500 mt-1">{g.description}</p>}
                    </div>
                    <button onClick={() => startEdit(g)} className="text-xs px-2 py-1 rounded border border-zinc-800 text-zinc-300 hover:text-amber-300">Edit</button>
                    <button onClick={() => del(g)} className="text-zinc-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                      <span>Progress</span><span className="text-zinc-300">{g.progress_pct?.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div className={`h-full ${g.progress_pct >= 100 ? "bg-emerald-500" : g.status === "at_risk" || g.status === "overdue" ? "bg-rose-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, g.progress_pct)}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                    <Metric label="Current" value={fmtValue(g.current_value, g.unit)} />
                    <Metric label="Target" value={fmtValue(g.target_value, g.unit)} />
                    <Metric label="Baseline" value={fmtValue(g.baseline_value, g.unit)} />
                    <Metric label="Due" value={g.end_date || "—"} />
                  </div>
                  {f && (f.remaining_months != null) && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/60 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                      <span>Required rate: <span className="text-zinc-300">{fmtValue(f.required_rate_per_month, g.unit)}/mo</span></span>
                      <span>Trend: <span className="text-zinc-300">{fmtValue(f.improvement_per_month, g.unit)}/mo</span></span>
                      <span>ETA: <span className={f.will_achieve ? "text-emerald-400" : "text-amber-400"}>{f.expected_completion_date || "—"}</span></span>
                      <span>Confidence: <span className="text-zinc-300">{Math.round((f.confidence || 0) * 100)}%</span></span>
                      {f.needs_acceleration && <span className="text-rose-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> needs acceleration</span>}
                    </div>
                  )}
                </div>
              );})}
            </div>
            <div>
              {editing ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3 sticky top-4">
                  <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-zinc-200">{editing.id ? "Edit" : "New"} goal</h3>
                    <button onClick={save} className="ml-auto text-xs px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                    <button onClick={() => setEditing(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                  </div>
                  <Field label="Title"><input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  <Field label="Description"><textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Category"><select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200">{CATS.map((c) => <option key={c} value={c}>{GOAL_CATEGORY_LABELS[c]}</option>)}</select></Field>
                    <Field label="Direction"><select value={editing.direction} onChange={(e) => setEditing({ ...editing, direction: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200"><option value="maximize">Maximize</option><option value="minimize">Minimize</option></select></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Target value"><input type="number" value={editing.target_value} onChange={(e) => setEditing({ ...editing, target_value: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                    <Field label="Baseline value"><input type="number" value={editing.baseline_value} onChange={(e) => setEditing({ ...editing, baseline_value: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Start date"><input type="date" value={editing.start_date} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                    <Field label="End date"><input type="date" value={editing.end_date} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Priority"><select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200">{["critical","high","medium","low"].map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
                    <Field label="Linked KPI code"><input value={editing.linked_kpi_code} onChange={(e) => setEditing({ ...editing, linked_kpi_code: e.target.value })} placeholder="auto" className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  </div>
                  <Field label="Notes"><textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                </div>
              ) : <p className="text-xs text-zinc-600 py-12 text-center">Select a goal to edit, or click "New Goal".</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }) { return <div><p className="text-zinc-600">{label}</p><p className="text-zinc-200 font-medium tabular-nums">{value}</p></div>; }
function Field({ label, children }) { return <label className="text-xs text-zinc-400 flex flex-col gap-1">{label}{children}</label>; }
function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }
function EmptyState({ onCreate }) { return <div className="text-center py-24"><Target className="w-10 h-10 text-zinc-700 mx-auto mb-3" /><p className="text-sm text-zinc-400 mb-4">No goals yet. Define your first strategic target.</p><button onClick={onCreate} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> New Goal</button></div>; }