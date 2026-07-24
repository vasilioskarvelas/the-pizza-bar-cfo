import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { base44 } from '@/api/base44Client';
import { fmtValue } from '@/lib/dashboardFormat';

const RANGES = [{ k: 7, l: "7D" }, { k: 30, l: "30D" }, { k: 90, l: "90D" }, { k: 365, l: "YTD" }];

export default function TrendChart({ defaultCode, siteId }) {
  const [code, setCode] = useState(defaultCode || "revenue");
  const [range, setRange] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    base44.functions.invoke("getDashboardTrends", { code, range_days: range, site_id: siteId })
      .then((r) => setData(r)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [code, range, siteId]);

  const points = data?.points || [];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold text-zinc-200">Trend Analysis</h3>
        <select value={code} onChange={(e) => setCode(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200">
          {(data?.available_codes || [code]).map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <div className="ml-auto flex gap-1">
          {RANGES.map((r) => <button key={r.k} onClick={() => setRange(r.k)} className={`px-2 py-0.5 rounded text-xs ${range === r.k ? "bg-amber-500/10 text-amber-300 border border-amber-500/20" : "border border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>{r.l}</button>)}
        </div>
      </div>
      {loading ? <p className="text-sm text-zinc-500 py-8 text-center">Loading…</p> : points.length === 0 ? (
        <p className="text-sm text-zinc-600 py-8 text-center">No trend data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={points}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis dataKey="period" stroke="#52525b" fontSize={11} tickFormatter={(p) => p.slice(5)} />
            <YAxis stroke="#52525b" fontSize={11} tickFormatter={(v) => fmtValue(v, data?.points?.[0]?.unit).replace(/\$/g, "")} width={50} />
            <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }} formatter={(v) => fmtValue(v, data?.points?.[0]?.unit)} />
            <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="moving_avg" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
      <p className="text-[10px] text-zinc-600 mt-2">Solid = value · dashed = 3-point moving average · {points.length} period(s)</p>
    </div>
  );
}