import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Rocket, Plus, Trash2, Save, X, RefreshCw, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { INITIATIVE_STATUS_STYLE, fmtValue } from '@/lib/planningFormat';
import { PRIORITY_STYLE } from '@/lib/forecastFormat';

const STATUSES = ["planned", "in_progress", "blocked", "completed", "cancelled"];

export default function Initiatives() {
  const [inits, setInits] = useState([]);
  const [goals, setGoals] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [r, g] = await Promise.all([base44.functions.invoke("getInitiatives", {}), base44.functions.invoke("getExecutiveGoals", {})]);
      setInits(r.initiatives || []); setGoals(g.goals || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const startCreate = () => setEditing({ id: null, title: "", description: "", goal_ids: [], due_date: "", budget_cents: 0, expected_roi_bps: 0, expected_owner_score_impact: 0, expected_cash_impact_cents: 0, status: "planned", completion_pct: 0, priority: "medium", dependencies: "", milestones: "", evidence: "" });
  const startEdit = (i) => setEditing({ id: i.id, title: i.title, description: i.description || "", goal_ids: i.goal_ids || [], due_date: i.due_date || "", budget_cents: i.budget_cents || 0, expected_roi_bps: i.expected_roi_bps || 0, expected_owner_score_impact: i.expected_owner_score_impact || 0, expected_cash_impact_cents: i.expected_cash_impact_cents || 0, status: i.status, completion_pct: i.completion_pct || 0, priority: i.priority, dependencies: (i.dependencies || []).join(", "), milestones: "", evidence: i.evidence || "" });
  const save = async () => {
    try {
      const deps = String(editing.dependencies || "").split(",").map((x) => x.trim()).filter(Boolean);
      await base44.functions.invoke("createInitiative", { action: editing.id ? "update" : "create", initiative_id: editing.id, ...editing, dependencies: deps, milestones: editing.id ? undefined : [] });
      setEditing(null); load();
    } catch (e) { console.error(e); }
  };
  const del = async (i) => { if (!confirm(`Delete "${i.title}"?`)) return; await base44.functions.invoke("createInitiative", { action: "delete", initiative_id: i.id }); load(); };
  const toggleGoal = (gid) => setEditing((e) => ({ ...e, goal_ids: e.goal_ids.includes(gid) ? e.goal_ids.filter((x) => x !== gid) : [...e.goal_ids, gid] }));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Rocket className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Strategic Initiatives</h1>
            <p className="text-xs text-zinc-500">Work contributing toward goals · {inits.length} initiatives</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
          <button onClick={startCreate} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button>
        </div>

        {loading ? <Spinner /> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-3">
              {inits.length === 0 ? <p className="text-xs text-zinc-600 py-12 text-center">No initiatives. Click "New".</p> : inits.map((i) => { const st = INITIATIVE_STATUS_STYLE[i.status] || INITIATIVE_STATUS_STYLE.planned; const pr = PRIORITY_STYLE[i.priority] || PRIORITY_STYLE.medium; return (
                <div key={i.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-zinc-100">{i.title}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${st.bg} ${st.text}`}>{st.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${pr}`}>{i.priority}</span>
                      </div>
                      {i.description && <p className="text-xs text-zinc-500 mt-1">{i.description}</p>}
                    </div>
                    <button onClick={() => startEdit(i)} className="text-xs px-2 py-1 rounded border border-zinc-800 text-zinc-300 hover:text-amber-300">Edit</button>
                    <button onClick={() => del(i)} className="text-zinc-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="mt-3"><div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${Math.min(100, i.completion_pct)}%` }} /></div></div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                    <Metric label="Due" value={i.due_date || "—"} />
                    <Metric label="Budget" value={fmtValue(i.budget_cents, "cents")} />
                    <Metric label="Exp. cash impact" value={fmtValue(i.expected_cash_impact_cents, "cents")} />
                    <Metric label="Score impact" value={i.expected_owner_score_impact ? `+${i.expected_owner_score_impact}` : "—"} />
                  </div>
                  {i.goal_ids?.length > 0 && <div className="mt-2 flex items-center gap-1 flex-wrap text-[11px] text-zinc-500"><Link2 className="w-3 h-3" />{i.goal_ids.map((gid) => { const g = goals.find((x) => x.id === gid); return <span key={gid} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{g?.title || gid.slice(0, 6)}</span>; })}</div>}
                </div>
              );})}
            </div>
            <div>
              {editing ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3 sticky top-4">
                  <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-zinc-200">{editing.id ? "Edit" : "New"} initiative</h3>
                    <button onClick={save} className="ml-auto text-xs px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                    <button onClick={() => setEditing(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                  </div>
                  <Field label="Title"><input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  <Field label="Description"><textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Due date"><input type="date" value={editing.due_date} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                    <Field label="Status"><select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200">{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Budget (cents)"><input type="number" value={editing.budget_cents} onChange={(e) => setEditing({ ...editing, budget_cents: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                    <Field label="Completion %"><input type="number" value={editing.completion_pct} onChange={(e) => setEditing({ ...editing, completion_pct: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Exp. cash impact (cents)"><input type="number" value={editing.expected_cash_impact_cents} onChange={(e) => setEditing({ ...editing, expected_cash_impact_cents: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                    <Field label="Score impact"><input type="number" value={editing.expected_owner_score_impact} onChange={(e) => setEditing({ ...editing, expected_owner_score_impact: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Priority"><select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200">{["critical","high","medium","low"].map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
                    <Field label="ROI (bps)"><input type="number" value={editing.expected_roi_bps} onChange={(e) => setEditing({ ...editing, expected_roi_bps: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  </div>
                  <Field label="Dependencies (comma-separated)"><input value={editing.dependencies} onChange={(e) => setEditing({ ...editing, dependencies: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  <Field label="Linked goals"><div className="flex flex-wrap gap-1 mt-1">{goals.map((g) => <button key={g.id} onClick={() => toggleGoal(g.id)} className={`text-[11px] px-2 py-1 rounded border ${editing.goal_ids.includes(g.id) ? "border-amber-500/30 text-amber-300 bg-amber-500/10" : "border-zinc-800 text-zinc-400"}`}>{g.title}</button>)}</div></Field>
                </div>
              ) : <p className="text-xs text-zinc-600 py-12 text-center">Select an initiative to edit, or click "New".</p>}
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