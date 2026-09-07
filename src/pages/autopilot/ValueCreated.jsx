import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatAUD, DEMO_BUSINESS } from '@/lib/autopilotEngine';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function ValueCreated() {
  const [records, setRecords] = useState(null);

  useEffect(() => {
    base44.entities.ValueCreatedRecord.filter({ business_id: DEMO_BUSINESS }, 'month', 24).then(setRecords).catch(console.error);
  }, []);

  if (!records) return <div className="p-8 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const latestRec = records[records.length - 1] || {};
  const sub = latestRec.subscription_cost_cents || 39900;
  const roi = sub > 0 ? (latestRec.verified_realised_cents / sub).toFixed(1) : '0';
  const chart = records.map((r) => ({ month: r.month.slice(5), identified: Math.round((r.potential_identified_cents || 0) / 100), approved: Math.round((r.actions_approved_cents || 0) / 100), realised: Math.round((r.verified_realised_cents || 0) / 100) }));

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold text-slate-900">Value Created</h1>
      <p className="text-slate-500 mt-1">Proof that Business Autopilot creates more value than it costs.</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
        <Stat label="This Month — Identified" value={formatAUD(latestRec.potential_identified_cents)} tone="slate" />
        <Stat label="Actions Approved" value={formatAUD(latestRec.actions_approved_cents)} tone="amber" />
        <Stat label="Verified Realised" value={formatAUD(latestRec.verified_realised_cents)} tone="emerald" />
        <Stat label="Subscription" value={formatAUD(sub)} tone="slate" />
        <Stat label="ROI" value={`${roi}x`} tone="emerald" />
      </div>

      <div className="bg-slate-900 text-white rounded-xl p-6 mt-6">
        <p className="text-sm text-slate-300">This month Business Autopilot verified {formatAUD(latestRec.verified_realised_cents)} in realised value against a {formatAUD(sub)} subscription.</p>
        <p className="text-3xl font-semibold mt-1">{roi}x return on investment</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
        <h3 className="font-semibold text-slate-900 mb-3">Value created over time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatAUD(v * 100)} />
            <Bar dataKey="identified" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
            <Bar dataKey="approved" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            <Bar dataKey="realised" fill="#10b981" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-xs">
          <Legend color="#cbd5e1" label="Identified" />
          <Legend color="#f59e0b" label="Approved" />
          <Legend color="#10b981" label="Realised" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const tones = { slate: 'text-slate-900', amber: 'text-amber-600', emerald: 'text-emerald-600' };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tones[tone]}`}>{value}</p>
    </div>
  );
}
function Legend({ color, label }) {
  return <span className="flex items-center gap-1.5 text-slate-500"><span className="w-3 h-3 rounded-sm" style={{ background: color }} /> {label}</span>;
}