import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Gavel, Plus, Save, X, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

const STATUSES = ["pending","implemented","reviewed","abandoned"];

export default function Decisions() {
  const [decisions, setDecisions] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); try { const r = await base44.functions.invoke("getDecisionLog", {}); setDecisions(r.decisions || []); } catch (e) { console.error(e); } setLoading(false); };
  useEffect(() => { load(); }, []);

  const startCreate = () => setEditing({ id: null, decision: "", reason: "", decision_date: new Date().toISOString().slice(0, 10), expected_outcome: "", expected_value: "", actual_outcome: "", actual_value: "", lessons_learned: "", status: "pending", review_date: "" });
  const startEdit = (d) => setEditing({ id: d.id, decision: d.decision, reason: d.reason || "", decision_date: d.decision_date, expected_outcome: d.expected_outcome || "", expected_value: d.expected_value ?? "", actual_outcome: d.actual_outcome || "", actual_value: d.actual_value ?? "", lessons_learned: d.lessons_learned || "", status: d.status, review_date: d.review_date || "" });
  const save = async () => {
    try {
      const body = { ...editing, expected_value: editing.expected_value === "" ? null : Number(editing.expected_value), actual_value: editing.actual_value === "" ? null : Number(editing.actual_value) };
      await base44.functions.invoke("createDecision", { action: editing.id ? "update" : "create", decision_id: editing.id, ...body });
      setEditing(null); load();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Gavel className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Decision Register</h1>
            <p className="text-xs text-zinc-500">Executive decisions · expected vs actual · {decisions.length} logged</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /></button>
          <button onClick={startCreate} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button>
        </div>

        {loading ? <Spinner /> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-3">
              {decisions.length === 0 ? <p className="text-xs text-zinc-600 py-12 text-center">No decisions logged.</p> : decisions.map((d) => (
                <div key={d.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-zinc-100">{d.decision}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{d.status}</span>
                        <span className="text-[11px] text-zinc-600">{d.decision_date}</span>
                      </div>
                      {d.reason && <p className="text-xs text-zinc-500 mt-1">{d.reason}</p>}
                    </div>
                    <button onClick={() => startEdit(d)} className="text-xs px-2 py-1 rounded border border-zinc-800 text-zinc-300 hover:text-amber-300">Edit</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                    <div><p className="text-zinc-600">Expected</p><p className="text-zinc-300 tabular-nums">{d.expected_value != null ? d.expected_value.toLocaleString() : "—"}</p></div>
                    <div><p className="text-zinc-600">Actual</p><p className="text-zinc-300 tabular-nums">{d.actual_value != null ? d.actual_value.toLocaleString() : "—"}</p></div>
                    <div><p className="text-zinc-600">Variance</p><p className={`tabular-nums ${d.variance != null ? (d.variance >= 0 ? "text-emerald-400" : "text-rose-400") : "text-zinc-600"}`}>{d.variance != null ? d.variance.toLocaleString() : "—"}</p></div>
                    <div><p className="text-zinc-600">Variance %</p><p className={`tabular-nums ${d.variance_pct != null ? (d.variance_pct >= 0 ? "text-emerald-400" : "text-rose-400") : "text-zinc-600"}`}>{d.variance_pct != null ? `${d.variance_pct > 0 ? "+" : ""}${d.variance_pct}%` : "—"}</p></div>
                  </div>
                  {d.lessons_learned && <p className="text-[11px] text-amber-400/70 mt-2">Lessons: {d.lessons_learned}</p>}
                </div>
              ))}
            </div>
            <div>
              {editing ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3 sticky top-4">
                  <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-zinc-200">{editing.id ? "Edit" : "New"} decision</h3>
                    <button onClick={save} className="ml-auto text-xs px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                    <button onClick={() => setEditing(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                  </div>
                  <Field label="Decision"><input value={editing.decision} onChange={(e) => setEditing({ ...editing, decision: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  <Field label="Reason"><textarea value={editing.reason} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} rows={2} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Decision date"><input type="date" value={editing.decision_date} onChange={(e) => setEditing({ ...editing, decision_date: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                    <Field label="Status"><select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200">{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
                  </div>
                  <Field label="Expected outcome"><input value={editing.expected_outcome} onChange={(e) => setEditing({ ...editing, expected_outcome: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Expected value"><input type="number" value={editing.expected_value} onChange={(e) => setEditing({ ...editing, expected_value: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                    <Field label="Actual value"><input type="number" value={editing.actual_value} onChange={(e) => setEditing({ ...editing, actual_value: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  </div>
                  <Field label="Actual outcome"><input value={editing.actual_outcome} onChange={(e) => setEditing({ ...editing, actual_outcome: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                  <Field label="Lessons learned"><textarea value={editing.lessons_learned} onChange={(e) => setEditing({ ...editing, lessons_learned: e.target.value })} rows={2} className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200" /></Field>
                </div>
              ) : <p className="text-xs text-zinc-600 py-12 text-center">Select a decision to edit, or click "New".</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) { return <label className="text-xs text-zinc-400 flex flex-col gap-1">{label}{children}</label>; }
function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }