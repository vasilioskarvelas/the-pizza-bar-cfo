import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { loadSnapshots, comparePeriods, formatAUD, formatPct, DEMO_BUSINESS } from '@/lib/autopilotEngine';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Revenue() {
  const [snapshots, setSnapshots] = useState(null);

  useEffect(() => { loadSnapshots().then(setSnapshots).catch(console.error); }, []);
  if (!snapshots) return <div className="p-8 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const { current, deltas } = comparePeriods(snapshots);
  const last30 = snapshots.slice(-30);
  const byDay = {};
  for (const s of last30) {
    const dow = new Date(s.period_start + 'T00:00:00Z').getUTCDay();
    if (!byDay[dow]) byDay[dow] = { total: 0, count: 0 };
    byDay[dow].total += s.revenue || 0;
    byDay[dow].count += 1;
  }
  const chart = Object.keys(byDay).sort((a, b) => a - b).map((d) => ({ day: DOW[d], revenue: Math.round(((byDay[d].total / byDay[d].count) || 0) / 100) }));
  const best = chart.reduce((m, x) => (x.revenue > m.revenue ? x : m), chart[0]);
  const worst = chart.reduce((m, x) => (x.revenue < m.revenue ? x : m), chart[0]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold text-slate-900">Revenue</h1>
      <p className="text-slate-500 mt-1">Where your revenue is coming from, and when.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <Stat label="Revenue (latest)" value={formatAUD(current?.revenue)} delta={deltas.revenue?.vs_last_month?.pct} />
        <Stat label="vs Last Week" delta={deltas.revenue?.vs_last_week?.pct} />
        <Stat label="vs Same Period Last Year" delta={deltas.revenue?.vs_last_year?.pct} />
        <Stat label="Best Day" value={`${best?.day} · ${formatAUD(best?.revenue * 100)}`} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
        <h3 className="font-semibold text-slate-900 mb-3">Average revenue by day of week (last 30 days)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatAUD(v * 100)} />
            <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
              {chart.map((c, i) => <Cell key={i} fill={c.day === worst?.day ? '#f43f5e' : c.day === best?.day ? '#10b981' : '#0f172a'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-500 mt-2">Green = strongest trading day. Red = weakest — consider roster or marketing focus here.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, delta }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      {value != null ? (
        <p className="text-xl font-semibold text-slate-900 mt-1">{value}</p>
      ) : delta != null ? (
        <p className={`text-xl font-semibold mt-1 ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{delta >= 0 ? '+' : ''}{delta?.toFixed(1)}%</p>
      ) : (
        <p className="text-xl font-semibold text-slate-900 mt-1">—</p>
      )}
    </div>
  );
}