import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { TrendingUp, RefreshCw, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import ForecastChart from '@/components/forecast/ForecastChart';
import { HORIZON_OPTIONS } from '@/lib/forecastFormat';
import { fmtValue, scoreColor, SEV_STYLE } from '@/lib/dashboardFormat';

export default function Forecast() {
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [horizon, setHorizon] = useState(12);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [fc, al] = await Promise.all([
        base44.functions.invoke("getForecast", { horizon }),
        base44.functions.invoke("getForecastAlerts", { horizon }).catch(() => ({ alerts: [] })),
      ]);
      setData(fc); setAlerts(al.alerts || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [horizon]);

  const refresh = async () => { setRefreshing(true); try { await base44.functions.invoke("runForecast", { horizon }); await load(); } catch {} setRefreshing(false); };

  const series = data?.series || [];
  const scoreSeries = series.find((s) => s.code === "owner_score");
  const periods = data?.periods || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Forecast</h1>
            <p className="text-xs text-zinc-500">Deterministic projection · actual / estimated / forecast · engine {data?.engine_version}</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <label className="text-xs text-zinc-400 flex items-center gap-1">Horizon
            <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200">
              {HORIZON_OPTIONS.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
            </select>
          </label>
          <button onClick={refresh} disabled={refreshing} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300"><RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh</button>
        </div>

        {data?.cache && <p className="text-[10px] text-zinc-600 mb-3">Cache: {data.cache.reused ? "reused" : "fresh"} · hash {data.cache.hash?.slice(0,12)}</p>}

        {loading && !data ? <Spinner /> : (
          <div className="space-y-4">
            {/* Owner Score forecast hero */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">Owner Score Forecast</h3>
                <ForecastChart series={scoreSeries} height={200} exportName="owner-score-forecast" />
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">Forecast Alerts</h3>
                {alerts.length === 0 ? <p className="text-xs text-zinc-600">No forecast risks detected.</p> : (
                  <div className="space-y-2">
                    {alerts.map((a) => { const s = SEV_STYLE[a.severity] || SEV_STYLE.medium; return (
                      <div key={a.id || a.rule_key} className={`rounded-lg border p-2 ${s.border} ${s.bg}`}>
                        <div className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /><span className="text-xs font-medium text-zinc-200">{a.title}</span></div>
                        <p className="text-[11px] text-zinc-400 mt-1">{a.reason}</p>
                      </div>
                    );})}
                  </div>
                )}
              </div>
            </div>

            {/* Metric forecast charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {series.filter((s) => s.code !== "owner_score").map((s) => <ForecastChart key={s.code} series={s} height={180} exportName={`forecast-${s.code}`} />)}
            </div>

            {/* Period table */}
            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <h3 className="text-sm font-semibold text-zinc-200 px-3 py-2 bg-zinc-900/60">Forecast Periods</h3>
              <div className="overflow-auto max-h-80">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900/80 sticky top-0">
                    <tr className="text-left text-zinc-500">
                      <th className="px-2 py-1.5">Period</th>
                      <th className="px-2 py-1.5 text-right">Revenue</th>
                      <th className="px-2 py-1.5 text-right">EBITDA</th>
                      <th className="px-2 py-1.5 text-right">Net Profit</th>
                      <th className="px-2 py-1.5 text-right">Cash</th>
                      <th className="px-2 py-1.5 text-right">GST</th>
                      <th className="px-2 py-1.5 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {periods.map((p) => (
                      <tr key={p.period_start}>
                        <td className="px-2 py-1.5 text-zinc-400 font-mono">{p.period_start.slice(0,7)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{fmtValue(p.metrics.revenue?.value, "cents")}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{fmtValue(p.metrics.ebitda?.value, "cents")}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{fmtValue(p.metrics.net_profit?.value, "cents")}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{fmtValue(p.metrics.cash?.value, "cents")}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{fmtValue(p.metrics.net_gst_position?.value, "cents")}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${scoreColor(p.owner_score?.score)}`}>{p.owner_score?.score != null ? p.owner_score.score.toFixed(1) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }