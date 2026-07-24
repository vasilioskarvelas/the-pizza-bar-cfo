import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Brush, ReferenceLine } from 'recharts';
import { fmtValue } from '@/lib/dashboardFormat';
import { KIND_STYLE } from '@/lib/forecastFormat';

// Reusable forecast chart: actuals (emerald solid) + forecast (amber) with optional
// scenario overlays. Supports zoom/pan (Brush), tooltips, and CSV export.
export default function ForecastChart({ series, height = 220, overlays = [], exportName }) {
  // series: { code, label, unit, actuals:[{period,value}], forecast:[{period,value}] }
  // overlays: [{ name, points:[{period,value}], color }]
  if (!series) return null;
  const actuals = series.actuals || [];
  const forecast = series.forecast || [];
  const unit = series.unit;
  const allPeriods = [...new Set([...actuals.map((p) => p.period), ...forecast.map((p) => p.period)])].sort();
  const lastActualPeriod = actuals.length ? actuals[actuals.length - 1].period : null;

  const data = allPeriods.map((period) => {
    const a = actuals.find((p) => p.period === period);
    const f = forecast.find((p) => p.period === period);
    const row = { period };
    if (a) row.Actual = a.value;
    if (f) row.Forecast = f.value;
    overlays.forEach((o) => { const ov = o.points.find((p) => p.period === period); if (ov) row[o.name] = ov.value; });
    return row;
  });

  const exportCsv = () => {
    const headers = ["period", "Actual", "Forecast", ...overlays.map((o) => o.name)];
    const csv = ["period," + headers.slice(1).join(",")].concat(data.map((r) => [r.period, r.Actual ?? "", r.Forecast ?? "", ...overlays.map((o) => r[o.name] ?? "")].join(","))).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = (exportName || series.code) + ".csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold text-zinc-200">{series.label || series.code}</h4>
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{unit}</span>
        {exportName && <button onClick={exportCsv} className="ml-auto text-[10px] px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 hover:text-amber-300">Export CSV</button>}
      </div>
      {data.length === 0 ? <p className="text-xs text-zinc-600 py-6 text-center">No data.</p> : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis dataKey="period" stroke="#52525b" fontSize={10} tickFormatter={(p) => p.slice(5)} />
            <YAxis stroke="#52525b" fontSize={10} width={48} tickFormatter={(v) => fmtValue(v, unit).replace(/[$,]/g, "")} />
            <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} formatter={(v) => fmtValue(v, unit)} />
            {lastActualPeriod && <ReferenceLine x={lastActualPeriod} stroke="#3f3f46" strokeDasharray="2 2" label={{ value: "now", fontSize: 9, fill: "#71717a", position: "top" }} />}
            <Line type="monotone" dataKey="Actual" stroke={KIND_STYLE.actual.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line type="monotone" dataKey="Forecast" stroke={KIND_STYLE.forecast.color} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} connectNulls />
            {overlays.map((o) => <Line key={o.name} type="monotone" dataKey={o.name} stroke={o.color} strokeWidth={1.5} dot={false} connectNulls />)}
            {data.length > 8 && <Brush dataKey="period" height={18} stroke="#f59e0b" fill="#27272a" travellerWidth={8} />}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}