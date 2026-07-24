import React from 'react';
import { STATUS_COLORS } from '@/lib/financials';

export default function MetricCard({ label, value, sublabel, status, icon: Icon, trend }) {
  const statusColor = STATUS_COLORS[status] || 'text-zinc-300';

  return (
    <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-5 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${statusColor}`} />}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${statusColor}`}>{value}</p>
      {sublabel && <p className="text-xs text-zinc-500 mt-1">{sublabel}</p>}
      {trend != null && (
        <div className="flex items-center gap-1 mt-2">
          <span className={`text-xs font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </span>
          <span className="text-xs text-zinc-600">vs last week</span>
        </div>
      )}
    </div>
  );
}