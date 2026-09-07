import React, { useState, useEffect } from 'react';
import { loadSnapshots, latest, cashForecast, formatAUD, formatSignedAUD } from '@/lib/autopilotEngine';
import { Wallet, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line as RLine, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

export default function CashFlow() {
  const [snapshots, setSnapshots] = useState(null);

  useEffect(() => { loadSnapshots().then(setSnapshots).catch(console.error); }, []);

  if (!snapshots) return <div className="p-8 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const cur = latest(snapshots);
  const fc7 = cashForecast(snapshots, 7);
  const fc30 = cashForecast(snapshots, 30);
  const fc90 = cashForecast(snapshots, 90);
  const chart = snapshots.slice(-30).map((s) => ({ date: s.period_start.slice(5), cash: Math.round((s.cash_position || 0) / 100) }));

  const rows = [
    { label: 'Current Cash', value: fc7.current, tone: 'slate' },
    { label: 'Next 7 Days', value: fc7.projected, tone: fc7.projected < 1000000 ? 'rose' : 'slate' },
    { label: 'Next 30 Days', value: fc30.projected, tone: fc30.projected < 1000000 ? 'rose' : 'slate' },
    { label: 'Next 90 Days', value: fc90.projected, tone: fc90.projected < 1000000 ? 'rose' : 'slate' },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-slate-600 mb-3">
        <Wallet className="w-5 h-5" />
        <span className="text-sm font-medium">Cash Flow</span>
      </div>
      <h1 className="text-3xl font-semibold text-slate-900">Cash position & forecast</h1>
      <p className="text-slate-500 mt-1">Projected from your 14-day average net cash flow of {formatSignedAUD(fc30.avgNet)}/day.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {rows.map((r) => (
          <div key={r.label} className={`rounded-xl border p-5 ${r.tone === 'rose' ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
            <p className="text-xs text-slate-500">{r.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${r.tone === 'rose' ? 'text-rose-600' : 'text-slate-900'}`}>{formatAUD(r.value)}</p>
          </div>
        ))}
      </div>

      {fc30.shortfall && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4 mt-4">
          <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-700">Projected cash shortfall: {formatAUD(fc30.shortfall.amount)} within {fc30.shortfall.days} days.</p>
            <p className="text-sm text-rose-600 mt-0.5">Recommended action: prioritise overdue invoice collection, defer non-essential supplier payments, and review roster for the quietest trading days.</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
        <h3 className="font-semibold text-slate-900 mb-3">Cash position — last 30 days</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatAUD(v * 100)} />
            <ReferenceLine y={10} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: '$10k floor', fontSize: 10, fill: '#f43f5e' }} />
            <RLine type="monotone" dataKey="cash" stroke="#0f172a" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Expected Money In</h3>
          <Row label="Outstanding receivables" value={cur?.outstanding_receivables} />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Expected Money Out</h3>
          <Row label="Bills due" value={cur?.bills_due} />
          <Row label="Payroll" value={cur?.labour_cents} />
          <Row label="Tax / Super" value={cur?.tax_obligations} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{formatAUD(value)}</span>
    </div>
  );
}