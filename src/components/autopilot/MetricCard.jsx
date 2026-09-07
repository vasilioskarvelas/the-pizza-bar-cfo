import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

export default function MetricCard({ label, value, delta, invertGood = false, isPct = false, sub }) {
  const d = delta?.vs_last_month;
  let good = null;
  if (d != null && d.pct != null) {
    good = invertGood ? d.pct <= 0 : d.pct >= 0;
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1 tracking-tight">{value}</p>
      <div className="flex items-center gap-1 mt-1 text-xs">
        {d == null || d.pct == null ? (
          <span className="text-slate-400">— no prior period</span>
        ) : (
          <>
            <span className={`flex items-center gap-0.5 font-medium ${good ? 'text-emerald-600' : 'text-rose-600'}`}>
              {d.pct > 0 ? <ArrowUp className="w-3 h-3" /> : d.pct < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {Math.abs(d.pct).toFixed(1)}%
            </span>
            <span className="text-slate-400">vs last month</span>
          </>
        )}
      </div>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}