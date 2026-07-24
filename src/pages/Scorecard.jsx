import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Gauge, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SCORECARD_STATUS_STYLE, fmtValue } from '@/lib/planningFormat';
import { TREND_COLOR, TREND_ARROW } from '@/lib/dashboardFormat';

export default function Scorecard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); try { setData(await base44.functions.invoke("getExecutiveScorecard", {})); } catch (e) { console.error(e); } setLoading(false); };
  useEffect(() => { load(); }, []);

  const rows = data?.rows || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Gauge className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Executive Scorecard</h1>
            <p className="text-xs text-zinc-500">Live business performance · deterministic · engine {data?.engine_version}</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
        </div>

        {loading ? <Spinner /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((r) => {
              const st = SCORECARD_STATUS_STYLE[r.status] || SCORECARD_STATUS_STYLE.no_data;
              const trend = r.trend || "no_prior";
              return (
                <div key={r.code} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-zinc-300">{r.label}</h3>
                    <span className={`text-xs ${st}`}>{r.status.replace("_", " ")}</span>
                  </div>
                  <p className={`text-2xl font-bold tabular-nums ${st}`}>{fmtValue(r.current, r.unit)}</p>
                  <div className="mt-2 pt-2 border-t border-zinc-800/60 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-zinc-600">Target</p><p className="text-zinc-300 tabular-nums">{r.target != null ? fmtValue(r.target, r.unit) : "—"}</p></div>
                    <div><p className="text-zinc-600">Variance</p><p className={`tabular-nums ${r.variance != null ? (r.variance >= 0 ? "text-emerald-400" : "text-rose-400") : "text-zinc-600"}`}>{r.variance != null ? fmtValue(r.variance, r.unit) : "—"}</p></div>
                    <div><p className="text-zinc-600">Trend</p><p className={`${TREND_COLOR[trend]} tabular-nums`}>{TREND_ARROW[trend]} {r.variance_pct != null ? `${r.variance_pct > 0 ? "+" : ""}${r.variance_pct}%` : ""}</p></div>
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-600 flex items-center justify-between">
                    <span>Confidence: <span className="text-zinc-400">{r.confidence || "—"}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }