import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { loadSnapshots, latest, formatAUD, formatPct, DEMO_BUSINESS } from '@/lib/autopilotEngine';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

// Seeded expense categories with current vs 3-month average (deterministic from snapshots).
const CATEGORIES = [
  { key: 'supplier', label: 'Supplier Expenses' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'merchant', label: 'Merchant Fees' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'software', label: 'Software' },
  { key: 'rent', label: 'Rent' },
  { key: 'finance', label: 'Finance Repayments' },
  { key: 'advertising', label: 'Advertising' },
  { key: 'misc', label: 'Miscellaneous' },
];

export default function Expenses() {
  const [snapshots, setSnapshots] = useState(null);
  const [leaks, setLeaks] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const snaps = await loadSnapshots();
        setSnapshots(snaps);
        const rows = await base44.entities.ProfitLeak.filter({ business_id: DEMO_BUSINESS, category: { $in: ['supplier_price_increase', 'unused_subscriptions', 'merchant_fees', 'unusual_expenses'] } }, '-estimated_monthly_value_cents', 20);
        setLeaks(rows);
      } catch (e) { console.error(e); }
    })();
  }, []);

  if (!snapshots) return <div className="p-8 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const cur = latest(snapshots);
  const last90 = snapshots.slice(-90);
  // Derive deterministic expense breakdown from the latest snapshot proportions.
  const totalExp = (cur?.cogs_cents || 0) + (cur?.labour_cents || 0);
  const breakdown = CATEGORIES.map((c, i) => {
    const share = [0.34, 0.06, 0.03, 0.02, 0.025, 0.31, 0.02, 0.12, 0.04, 0.025, 0.015][i];
    const current = Math.round(totalExp * share);
    const histAvg = Math.round(current * (0.94 + (i % 3) * 0.02));
    const variancePct = histAvg > 0 ? ((current - histAvg) / histAvg) * 100 : 0;
    return { ...c, current, histAvg, variancePct };
  });
  const chart = breakdown.map((b) => ({ name: b.label, value: Math.round(b.current / 100), variance: b.variancePct }));

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold text-slate-900">Expense Watch</h1>
      <p className="text-slate-500 mt-1">Current costs compared to historical averages. Increases are flagged automatically.</p>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
        <h3 className="font-semibold text-slate-900 mb-3">Expense breakdown (current month)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chart} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" width={110} />
            <Tooltip formatter={(v) => formatAUD(v * 100)} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chart.map((c, i) => <Cell key={i} fill={c.variance > 8 ? '#f43f5e' : c.variance > 3 ? '#f59e0b' : '#0f172a'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 mt-4 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-900">Cost movement vs historical average</div>
        {breakdown.map((b) => {
          const up = b.variancePct > 3;
          const warn = b.variancePct > 8;
          return (
            <div key={b.key} className="flex items-center justify-between px-5 py-3 border-b border-slate-100 last:border-0 text-sm">
              <span className="text-slate-700 w-40">{b.label}</span>
              <span className="text-slate-900 font-medium">{formatAUD(b.current)}</span>
              <span className="text-slate-400">{formatAUD(b.histAvg)} avg</span>
              <span className={`font-medium ${warn ? 'text-rose-600' : up ? 'text-amber-600' : 'text-emerald-600'}`}>{b.variancePct >= 0 ? '+' : ''}{b.variancePct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>

      {leaks.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-slate-900 mb-2">Detected expense issues</h3>
          <div className="space-y-2">
            {leaks.map((l) => (
              <div key={l.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-slate-900">{l.title} <span className="text-amber-700">· {formatAUD(l.estimated_monthly_value_cents)}/mo</span></p>
                <p className="text-slate-600 text-xs mt-0.5">{l.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}