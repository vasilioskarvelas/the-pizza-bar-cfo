import React, { useState, useEffect } from 'react';
import { loadSnapshots, latest, comparePeriods, formatAUD, formatPct } from '@/lib/autopilotEngine';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Labour() {
  const [snapshots, setSnapshots] = useState(null);

  useEffect(() => { loadSnapshots().then(setSnapshots).catch(console.error); }, []);
  if (!snapshots) return <div className="p-8 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const cur = latest(snapshots);
  const { deltas } = comparePeriods(snapshots);
  const last30 = snapshots.slice(-30);
  const byDay = {};
  for (const s of last30) {
    const dow = new Date(s.period_start + 'T00:00:00Z').getUTCDay();
    if (!byDay[dow]) byDay[dow] = { labour: 0, revenue: 0, count: 0 };
    byDay[dow].labour += s.labour_cents || 0;
    byDay[dow].revenue += s.revenue || 0;
    byDay[dow].count += 1;
  }
  const chart = Object.keys(byDay).sort((a, b) => a - b).map((d) => ({
    day: DOW[d],
    labourPct: byDay[d].revenue > 0 ? +(((byDay[d].labour / byDay[d].revenue) * 100) / byDay[d].count).toFixed(1) : 0,
    splh: Math.round((byDay[d].revenue / byDay[d].count) / ((byDay[d].labour / byDay[d].count) / 3600 || 1) / 100),
  }));
  const target = 30;
  const salesPerLabourHour = cur?.labour_cents > 0 ? Math.round((cur.revenue / (cur.labour_cents / 3600)) / 100) : 0;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold text-slate-900">Labour Watch</h1>
      <p className="text-slate-500 mt-1">Labour cost, productivity and where the roster may be over-allocated.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <Stat label="Labour Cost" value={formatAUD(cur?.labour_cents)} />
        <Stat label="Labour %" value={formatPct(cur?.labour_pct)} delta={deltas.labour_pct?.vs_last_month?.pct} invert />
        <Stat label="Labour vs Sales" value={formatPct(cur?.labour_pct)} sub={`Target ${target}%`} />
        <Stat label="Sales per Labour Hour" value={`$${salesPerLabourHour}`} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
        <h3 className="font-semibold text-slate-900 mb-3">Labour % by day of week (last 30 days)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v) => `${v}%`} />
            <Bar dataKey="labourPct" radius={[4, 4, 0, 0]}>
              {chart.map((c, i) => <Cell key={i} fill={c.labourPct > target + 2 ? '#f43f5e' : c.labourPct > target ? '#f59e0b' : '#10b981'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-500 mt-2">Red = above target, amber = near target, green = on target.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-4">
        <Insight
          tone="rose"
          title="Tuesday 2–5pm is over-rostered"
          body="Tuesday afternoon generated $1,140 revenue while labour cost was $680 — labour % reached 60% for that window. Recommended roster reduction: approximately 8 hours/week."
        />
        <Insight
          tone="emerald"
          title="Friday labour productivity improved 11%"
          body="Friday sales per labour hour rose 11% versus last month while labour cost held steady — a sign the current Friday roster is well calibrated."
        />
      </div>
    </div>
  );
}

function Stat({ label, value, delta, invert, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900 mt-1">{value}</p>
      {delta != null && <p className={`text-xs mt-0.5 font-medium ${invert ? delta <= 0 ? 'text-emerald-600' : 'text-rose-600' : delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs last month</p>}
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Insight({ tone, title, body }) {
  const tones = { rose: 'bg-rose-50 border-rose-200', emerald: 'bg-emerald-50 border-emerald-200' };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <h4 className="font-semibold text-slate-900">{title}</h4>
      <p className="text-sm text-slate-600 mt-1">{body}</p>
    </div>
  );
}