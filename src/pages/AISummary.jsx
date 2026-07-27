import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, RefreshCw, ShieldCheck, AlertTriangle, Wand2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const OUTLOOK_STYLE = {
  strong: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  stable: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  cautious: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  at_risk: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  critical: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};
const VALIDATION_STYLE = {
  passed: { icon: ShieldCheck, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Numbers validated' },
  failed: { icon: AlertTriangle, cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', label: 'Hallucination detected — used fallback' },
  fallback: { icon: AlertTriangle, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'AI unavailable — used deterministic fallback' },
  skipped: { icon: AlertTriangle, cls: 'bg-zinc-700/30 text-zinc-400 border-zinc-600/40', label: 'Validation skipped' },
};
const PRIORITY_STYLE = {
  critical: 'bg-rose-500/10 text-rose-400', high: 'bg-orange-500/10 text-orange-400',
  medium: 'bg-amber-500/10 text-amber-400', low: 'bg-zinc-700/30 text-zinc-400',
};

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

export default function AISummary() {
  const [summaries, setSummaries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getAISummaries", {});
      const list = res.summaries || [];
      setSummaries(list);
      if (list.length && !list.find((s) => s.id === selectedId)) setSelectedId(list[0].id);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const selected = summaries.find((s) => s.id === selectedId) || summaries[0] || null;
  const payload = selected ? safeParse(selected.payload) : null;

  const generate = async () => {
    setBusy(true);
    try {
      await base44.functions.invoke("generateAISummary", { force });
      await load();
    } catch (e) { console.error(e); alert(e.message || "Failed to generate summary"); }
    setBusy(false);
  };

  const v = selected ? VALIDATION_STYLE[selected.validation_status] || VALIDATION_STYLE.skipped : null;
  const VIcon = v?.icon;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Sparkles className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">AI Executive Summary</h1>
            <p className="text-xs text-zinc-500">Fixed-format AI summary · permission-filtered context · numeric validation · engine {selected?.engine_version || "—"}</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={() => setForce((f) => !f)} className={`text-xs px-3 py-1.5 rounded-lg border ${force ? "border-amber-500/30 text-amber-300 bg-amber-500/10" : "border-zinc-800 text-zinc-300"}`}>{force ? "Force new" : "Reuse if exists"}</button>
          <button onClick={generate} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} /> Generate</button>
        </div>

        {loading ? <Spinner /> : !payload ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
            <Wand2 className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <h2 className="text-sm font-semibold text-zinc-300 mb-1">No AI summaries yet</h2>
            <p className="text-xs text-zinc-600 mb-4">Generate a fixed-format AI executive summary. The LLM sees only your permission-filtered numbers and its quoted figures are validated against the source.</p>
            <button onClick={generate} disabled={busy} className="text-sm px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-2 mx-auto"><RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Generate summary</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              {v && (
                <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${v.cls}`}>
                  <VIcon className="w-4 h-4" />
                  <span>{v.label}</span>
                  {selected.used_fallback && <span className="text-zinc-500">· deterministic engine output</span>}
                  <span className="ml-auto text-zinc-600">model: {selected.model || "automatic"}</span>
                </div>
              )}

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded border ${OUTLOOK_STYLE[payload.outlook] || OUTLOOK_STYLE.cautious}`}>Outlook: {payload.outlook?.replace("_", " ")}</span>
                  <span className="text-xs px-2 py-0.5 rounded border border-zinc-700 text-zinc-400">Confidence: {payload.confidence}</span>
                </div>
                <p className="text-base text-zinc-100 leading-relaxed">{payload.headline}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ListBlock title="Strengths" items={payload.strengths} color="emerald" />
                <ListBlock title="Concerns" items={payload.concerns} color="rose" />
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h3 className="text-sm font-semibold text-zinc-200 mb-3">Recommended actions</h3>
                <div className="space-y-2">
                  {(payload.recommended_actions || []).map((a, i) => (
                    <div key={i} className="rounded-lg bg-zinc-800/30 border border-zinc-800 p-3">
                      <div className="flex items-start gap-2">
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${PRIORITY_STYLE[a.priority] || PRIORITY_STYLE.medium}`}>{a.priority}</span>
                        <div>
                          <p className="text-sm text-zinc-200">{a.action}</p>
                          <p className="text-xs text-zinc-500 mt-1">{a.rationale}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!payload.recommended_actions?.length && <p className="text-xs text-zinc-600">None.</p>}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-1">History</h3>
              {summaries.map((s) => {
                const sv = VALIDATION_STYLE[s.validation_status] || VALIDATION_STYLE.skipped;
                return (
                  <button key={s.id} onClick={() => setSelectedId(s.id)} className={`w-full text-left rounded-lg border p-3 transition-colors ${s.id === selected?.id ? "border-amber-500/30 bg-amber-500/10" : "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/40"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">{(s.generated_at || "").slice(0, 10)}</span>
                      {s.site_id ? <span className="text-[10px] text-zinc-500">site</span> : <span className="text-[10px] text-amber-400">org</span>}
                    </div>
                    <p className="text-xs text-zinc-300 mt-1 line-clamp-2">{s.headline}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${OUTLOOK_STYLE[s.outlook] || OUTLOOK_STYLE.cautious}`}>{s.outlook?.replace("_", " ")}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sv.cls}`}>{s.used_fallback ? "fallback" : s.validation_status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ListBlock({ title, items, color }) {
  const dot = color === "emerald" ? "bg-emerald-400" : "bg-rose-400";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{title} ({items?.length || 0})</h3>
      {!items?.length ? <p className="text-xs text-zinc-600">None.</p> : (
        <ul className="space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
              <span className={`w-1.5 h-1.5 rounded-full ${dot} mt-1.5 shrink-0`} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }