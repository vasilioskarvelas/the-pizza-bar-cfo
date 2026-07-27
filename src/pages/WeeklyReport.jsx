import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { FileText, RefreshCw, Mail, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fmtValue, TREND_COLOR, TREND_ARROW } from '@/lib/dashboardFormat';

const METRIC_META = {
  revenue: { label: "Revenue", unit: "cents" },
  gross_profit: { label: "Gross Profit", unit: "cents" },
  gross_margin: { label: "Gross Margin", unit: "bps" },
  ebitda: { label: "EBITDA", unit: "cents" },
  net_profit: { label: "Net Profit", unit: "cents" },
  cash: { label: "Cash", unit: "cents" },
  closing_cash: { label: "Closing Cash", unit: "cents" },
  cash_runway: { label: "Cash Runway", unit: "days" },
  working_capital: { label: "Working Capital", unit: "cents" },
  current_ratio: { label: "Current Ratio", unit: "ratio_4dp" },
  debt_ratio: { label: "Debt Ratio", unit: "bps" },
  long_term_debt: { label: "Long-term Debt", unit: "cents" },
  net_gst_position: { label: "Net GST Position", unit: "cents" },
  labour_cost_pct: { label: "Labour Cost %", unit: "bps" },
  food_cost_pct: { label: "Food Cost %", unit: "bps" },
  owner_score: { label: "Owner Score", unit: "score" },
};
const METRIC_ORDER = Object.keys(METRIC_META);

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

export default function WeeklyReport() {
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getWeeklyReports", {});
      const list = res.reports || [];
      setReports(list);
      if (list.length && !list.find((r) => r.id === selectedId)) setSelectedId(list[0].id);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const selected = reports.find((r) => r.id === selectedId) || reports[0] || null;
  const payload = selected ? safeParse(selected.payload) : null;

  const generate = async () => {
    setBusy(true);
    try {
      await base44.functions.invoke("generateWeeklyReport", { send_email: sendEmail, use_current_week: false });
      await load();
    } catch (e) { console.error(e); alert(e.message || "Failed to generate report"); }
    setBusy(false);
  };

  const deltas = payload?.deltas || {};
  const activity = payload?.activity || {};
  const summary = payload?.summary || {};

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-4 print:hidden">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><FileText className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Weekly Report</h1>
            <p className="text-xs text-zinc-500">Deterministic weekly executive snapshot · engine {payload?.engine_version || "—"}</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={generate} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1 disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} /> Generate</button>
          <button onClick={() => setSendEmail((v) => !v)} className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1 ${sendEmail ? "border-amber-500/30 text-amber-300 bg-amber-500/10" : "border-zinc-800 text-zinc-300"}`}><Mail className="w-3 h-3" /> {sendEmail ? "Email on" : "Email off"}</button>
          <button onClick={() => window.print()} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><Printer className="w-3 h-3" /> Print</button>
        </div>

        {loading ? <Spinner /> : !payload ? (
          <Empty onGenerate={generate} busy={busy} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-zinc-200">{summary.headline || `${selected.week_start} → ${selected.week_end}`}</h2>
                  <span className={`text-[11px] px-2 py-0.5 rounded ${selected.delivered_via_email ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>{selected.delivered_via_email ? "emailed" : "in-app"}</span>
                </div>
                <div className="space-y-1">
                  {(summary.narrative || []).map((l, i) => <p key={i} className="text-sm text-zinc-300">{l}</p>)}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h3 className="text-sm font-semibold text-zinc-200 mb-3">Key metrics (vs prior period)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                      <th className="py-2 font-medium">Metric</th><th className="text-right font-medium">Current</th><th className="text-right font-medium">Prior</th><th className="text-right font-medium">Δ%</th>
                    </tr></thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {METRIC_ORDER.filter((c) => deltas[c]).map((c) => {
                        const m = METRIC_META[c]; const v = deltas[c];
                        return (
                          <tr key={c}>
                            <td className="py-2 text-zinc-300">{m.label}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-200">{fmtValue(v.current, m.unit)}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-500">{fmtValue(v.previous, m.unit)}</td>
                            <td className={`py-2 text-right tabular-nums ${TREND_COLOR[v.trend]}`}>{TREND_ARROW[v.trend]} {v.delta_pct != null ? `${v.delta_pct > 0 ? "+" : ""}${v.delta_pct}%` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <ActivitySections payload={payload} />
            </div>

            <div className="space-y-2 print:hidden">
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-1">History</h3>
              {reports.map((r) => (
                <button key={r.id} onClick={() => setSelectedId(r.id)} className={`w-full text-left rounded-lg border p-3 transition-colors ${r.id === selected?.id ? "border-amber-500/30 bg-amber-500/10" : "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/40"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-200">{r.week_start}</span>
                    {r.site_id ? <span className="text-[10px] text-zinc-500">site</span> : <span className="text-[10px] text-amber-400">org</span>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{r.summary_text?.split(" · ")[1] || r.summary_text}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-600">
                    <span>{r.alerts_count} alerts</span><span>{r.goals_updated} goals</span><span>{r.decisions_count} dec</span>
                    {r.delivered_via_email && <span className="text-emerald-400">✉</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivitySections({ payload }) {
  const blocks = [
    { title: "Goals updated", items: payload.goals, render: (g) => `${g.title} · ${g.status} · ${g.progress}%` },
    { title: "Initiatives updated", items: payload.initiatives, render: (i) => `${i.title} · ${i.status} · ${i.completion}%` },
    { title: "Decisions logged", items: payload.decisions, render: (d) => `${d.decision} · ${d.status}${d.variance_pct != null ? ` · ${d.variance_pct > 0 ? "+" : ""}${d.variance_pct}%` : ""}` },
    { title: "Alerts this week", items: payload.alerts, render: (a) => `${a.title} · ${a.severity} · ${a.status}` },
    { title: "Opportunities", items: payload.opportunities, render: (o) => `${o.title} · ${o.status} · ${o.priority}` },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {blocks.map((b) => (
        <div key={b.title} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{b.title} ({b.items?.length || 0})</h3>
          {!b.items?.length ? <p className="text-xs text-zinc-600">None this week.</p> : (
            <ul className="space-y-1">
              {b.items.map((x) => <li key={x.id} className="text-xs text-zinc-300">{b.render(x)}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function Empty({ onGenerate, busy }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
      <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
      <h2 className="text-sm font-semibold text-zinc-300 mb-1">No weekly reports yet</h2>
      <p className="text-xs text-zinc-600 mb-4">Generate the first deterministic weekly executive snapshot.</p>
      <button onClick={onGenerate} disabled={busy} className="text-sm px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-2 mx-auto"><RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Generate report</button>
    </div>
  );
}

function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }