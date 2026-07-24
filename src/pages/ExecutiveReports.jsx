import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { FileText, RefreshCw, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fmtValue, SEV_STYLE } from '@/lib/planningFormat';

export default function ExecutiveReports() {
  const [report, setReport] = useState(null);
  const [format, setFormat] = useState("full");
  const [loading, setLoading] = useState(false);

  const load = async () => { setLoading(true); try { setReport(await base44.functions.invoke("generateExecutiveReport", { format })); } catch (e) { console.error(e); } setLoading(false); };
  useEffect(() => { load(); }, []);

  const es = report?.executive_summary;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><FileText className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Executive Report</h1>
            <p className="text-xs text-zinc-500">Deterministic · printable · engine {report?.meta?.engine_version}</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="text-xs bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200">
            <option value="full">Full</option><option value="executive_summary">Executive Summary</option>
            <option value="board">Board</option><option value="financial_only">Financial Only</option><option value="scorecard">Scorecard</option>
          </select>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Generate</button>
          <button onClick={() => window.print()} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1"><Printer className="w-3 h-3" /> Print</button>
        </div>

        {loading || !report ? <Spinner /> : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6 print:border-0 print:bg-white print:text-black">
            <div className="border-b border-zinc-800 pb-3">
              <h2 className="text-lg font-bold">HFOS Executive Report</h2>
              <p className="text-xs text-zinc-500">Generated {report.meta?.generated_at} · Period {report.meta?.period_start} → {report.meta?.period_end}</p>
            </div>

            {es && (
              <Section title="Executive Summary">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <Stat label="Owner Score" value={es.owner_score != null ? es.owner_score.toFixed(1) : "—"} />
                  <Stat label="Revenue" value={fmtValue(es.revenue, "cents")} />
                  <Stat label="Net Profit" value={fmtValue(es.net_profit, "cents")} />
                  <Stat label="Cash" value={fmtValue(es.cash, "cents")} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
                  <Stat label="Goals achieved" value={`${es.goals.achieved}/${es.goals.total}`} />
                  <Stat label="Initiatives done" value={`${es.initiatives.completed}/${es.initiatives.total}`} />
                  <Stat label="Open risks" value={es.risks.total} />
                  <Stat label="Opp. impact" value={fmtValue(es.opportunities.total_impact_cents, "cents")} />
                </div>
              </Section>
            )}

            <Section title="Financial Performance">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-zinc-500 text-xs border-b border-zinc-800"><th className="py-1">Metric</th><th className="py-1 text-right">Value</th><th className="py-1">Confidence</th></tr></thead>
                <tbody>
                  {(report.financial_performance || []).map((f) => <tr key={f.code} className="border-b border-zinc-800/40"><td className="py-1 text-zinc-300">{f.code}</td><td className="py-1 text-right tabular-nums">{f.value != null ? fmtValue(f.value, "cents") : "—"}</td><td className="py-1 text-zinc-500">{f.confidence || "—"}</td></tr>)}
                </tbody>
              </table>
            </Section>

            <Section title="Goals">
              <div className="space-y-1">{(report.goals || []).map((g) => <div key={g.id} className="flex items-center text-sm"><span className="text-zinc-300">{g.title}</span><span className="text-zinc-500 ml-2 text-xs">{g.status}</span><span className="ml-auto text-zinc-400 tabular-nums">{g.progress?.toFixed(0)}%</span></div>)}</div>
              {(!report.goals || !report.goals.length) && <p className="text-xs text-zinc-600">No goals.</p>}
            </Section>

            <Section title="Initiatives">
              <div className="space-y-1">{(report.initiatives || []).map((i) => <div key={i.id} className="flex items-center text-sm"><span className="text-zinc-300">{i.title}</span><span className="text-zinc-500 ml-2 text-xs">{i.status}</span><span className="ml-auto text-zinc-400 tabular-nums">{i.completion}%</span></div>)}</div>
              {(!report.initiatives || !report.initiatives.length) && <p className="text-xs text-zinc-600">No initiatives.</p>}
            </Section>

            <Section title="Risks">
              <div className="space-y-1">{(report.risks || []).map((r) => { const s = SEV_STYLE[r.severity] || SEV_STYLE.medium; return <div key={r.id} className="flex items-center text-sm"><span className={`w-1.5 h-1.5 rounded-full ${s.dot} mr-2`} /><span className="text-zinc-300">{r.title}</span><span className={`ml-2 text-xs ${s.text}`}>{s.label}</span><span className="ml-auto text-zinc-400 text-xs">{r.status}</span></div>; })}</div>
              {(!report.risks || !report.risks.length) && <p className="text-xs text-zinc-600">No risks.</p>}
            </Section>

            <Section title="Opportunities">
              <div className="space-y-1">{(report.opportunities || []).map((o) => <div key={o.id} className="flex items-center text-sm"><Lightbulb className="w-3 h-3 text-emerald-400 mr-2" /><span className="text-zinc-300">{o.title}</span><span className="ml-auto text-emerald-400 tabular-nums text-xs">{fmtValue(o.financial_impact_cents, "cents")}</span></div>)}</div>
              {(!report.opportunities || !report.opportunities.length) && <p className="text-xs text-zinc-600">No opportunities.</p>}
            </Section>

            <Section title="Decision Register">
              <table className="w-full text-sm"><thead><tr className="text-left text-zinc-500 text-xs border-b border-zinc-800"><th className="py-1">Decision</th><th className="py-1">Date</th><th className="py-1">Status</th><th className="py-1 text-right">Variance %</th></tr></thead>
                <tbody>{(report.decisions || []).map((d) => <tr key={d.id} className="border-b border-zinc-800/40"><td className="py-1 text-zinc-300">{d.decision}</td><td className="py-1 text-zinc-500">{d.date}</td><td className="py-1 text-zinc-500">{d.status}</td><td className="py-1 text-right tabular-nums">{d.variance_pct != null ? `${d.variance_pct}%` : "—"}</td></tr>)}</tbody>
              </table>
              {(!report.decisions || !report.decisions.length) && <p className="text-xs text-zinc-600">No decisions.</p>}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) { return <section><h3 className="text-sm font-semibold text-zinc-200 mb-2">{title}</h3>{children}</section>; }
function Stat({ label, value }) { return <div className="rounded-lg bg-zinc-800/40 p-3"><p className="text-xs text-zinc-500">{label}</p><p className="text-lg font-semibold tabular-nums">{value}</p></div>; }
function Lightbulb() { return <span className="text-emerald-400">◆</span>; }
function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }