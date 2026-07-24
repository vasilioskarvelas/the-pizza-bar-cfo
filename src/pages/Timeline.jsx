import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import ForecastChart from '@/components/forecast/ForecastChart';
import { GRANULARITY_OPTIONS, HORIZON_OPTIONS, downloadCSV, toCSV } from '@/lib/forecastFormat';
import DrillDownModal from '@/components/dashboard/DrillDownModal';

const METRICS = ["revenue","gross_profit","ebitda","net_profit","cash","net_gst_position","working_capital","long_term_debt","owner_score","gross_margin","labour_cost_pct","food_cost_pct","current_ratio","quick_ratio","cash_runway"];
const CATEGORIES = ["profitability","liquidity","debt","tax","score"];
const EVENT_TYPES = ["calculation","connector","reconciliation","audit","owner_score","methodology","configuration","alert"];

export default function Timeline() {
  const [data, setData] = useState(null);
  const [granularity, setGranularity] = useState("monthly");
  const [horizon, setHorizon] = useState(6);
  const [metric, setMetric] = useState("");
  const [category, setCategory] = useState("");
  const [eventType, setEventType] = useState("");
  const [includeForecast, setIncludeForecast] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [drill, setDrill] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await base44.functions.invoke("getFinancialTimeline", { granularity, horizon, metric, category, event_type: eventType, include_forecast: includeForecast, from, to });
      setData(r);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [granularity, horizon, metric, category, eventType, includeForecast, from, to]);

  const metrics = data?.metrics || [];
  const events = data?.events || [];
  const exportAll = () => {
    const rows = [];
    metrics.forEach((m) => {
      [...(m.actuals||[]), ...(m.forecast||[])].forEach((p) => rows.push({ metric: m.code, period: p.period, value: p.value, kind: p.kind || "actual", confidence: p.confidence }));
    });
    downloadCSV(`timeline-${granularity}.csv`, toCSV(rows, ["metric","period","value","kind","confidence"]));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Calendar className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Financial Timeline</h1>
            <p className="text-xs text-zinc-500">Historical + forecast, deterministic · daily / weekly / monthly / quarterly / yearly</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={exportAll} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Export CSV</button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 mb-4 flex flex-wrap items-center gap-2">
          <Sel label="Granularity" value={granularity} onChange={setGranularity} options={GRANULARITY_OPTIONS} />
          <Sel label="Horizon" value={horizon} onChange={setHorizon} options={HORIZON_OPTIONS} />
          <Sel label="Metric" value={metric} onChange={setMetric} options={[{key:"",label:"All"},...METRICS.map((m)=>({key:m,label:m}))]} />
          <Sel label="Category" value={category} onChange={setCategory} options={[{key:"",label:"All"},...CATEGORIES.map((c)=>({key:c,label:c}))]} />
          <Sel label="Event" value={eventType} onChange={setEventType} options={[{key:"",label:"All"},...EVENT_TYPES.map((e)=>({key:e,label:e}))]} />
          <label className="text-xs text-zinc-400 flex items-center gap-1">From <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-200" /></label>
          <label className="text-xs text-zinc-400 flex items-center gap-1">To <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-zinc-200" /></label>
          <label className="text-xs text-zinc-400 flex items-center gap-1.5 ml-auto"><input type="checkbox" checked={includeForecast} onChange={(e)=>setIncludeForecast(e.target.checked)} className="accent-amber-500" /> Forecast</label>
        </div>

        {loading && !data ? <Spinner /> : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
              {metrics.map((m) => <ForecastChart key={m.code} series={m} height={180} exportName={`timeline-${m.code}`} />)}
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <h3 className="text-sm font-semibold text-zinc-200 mb-2">Activity Events ({events.length})</h3>
              {events.length === 0 ? <p className="text-xs text-zinc-600">No events in range.</p> : (
                <div className="space-y-1 max-h-72 overflow-auto">
                  {events.map((e) => (
                    <button key={e.id} onClick={() => e.entity_type === "CalculationRun" && e.entity_id && setDrill({ kind: e.event_key?.includes("owner_score") ? "owner" : "kpi", result_id: e.entity_id, title: e.title })}
                      className="w-full flex items-center gap-2 text-left px-2 py-1 rounded hover:bg-zinc-800/50">
                      <span className={`w-1.5 h-1.5 rounded-full ${e.severity === "critical" ? "bg-rose-500" : "bg-zinc-600"}`} />
                      <span className="text-xs text-zinc-500 font-mono shrink-0">{(e.timestamp||"").slice(0,10)}</span>
                      <span className="text-xs text-zinc-300">{e.title}</span>
                      <span className="ml-auto text-[10px] text-zinc-600 uppercase">{e.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {drill && <DrillDownModal target={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

function Sel({ label, value, onChange, options }) {
  return <label className="text-xs text-zinc-400 flex items-center gap-1">{label}
    <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200">
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  </label>;
}
function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }