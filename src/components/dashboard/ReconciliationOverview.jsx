import React from 'react';
import { Link } from 'react-router-dom';
import { GitCompareArrows, CheckCircle2, AlertTriangle, Copy, AlertCircle, Clock } from 'lucide-react';

export default function ReconciliationOverview({ recon }) {
  if (!recon) return null;
  const items = [
    { label: "Matched", value: recon.matched, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Partial", value: recon.partial, icon: Clock, color: "text-amber-400" },
    { label: "Unmatched", value: recon.unmatched, icon: AlertCircle, color: "text-orange-400" },
    { label: "Duplicates", value: recon.duplicates, icon: Copy, color: "text-sky-400" },
    { label: "Critical", value: recon.critical, icon: AlertTriangle, color: "text-rose-400" },
    { label: "Pending", value: recon.pending_review, icon: AlertCircle, color: "text-zinc-300" },
    { label: "Resolved today", value: recon.resolved_today, icon: CheckCircle2, color: "text-emerald-400" },
  ];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <GitCompareArrows className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Reconciliation Overview</h3>
        <Link to="/admin/reconciliation" className="ml-auto text-[11px] text-amber-400 hover:underline">Open queue →</Link>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {items.map((it) => { const Icon = it.icon; return (
          <Link to="/admin/reconciliation" key={it.label} className="text-center rounded-lg bg-zinc-800/40 p-2 hover:bg-zinc-800/70">
            <Icon className={`w-4 h-4 mx-auto mb-1 ${it.color}`} />
            <p className="text-lg font-bold tabular-nums text-zinc-100">{it.value}</p>
            <p className="text-[10px] text-zinc-500">{it.label}</p>
          </Link>
        ); })}
      </div>
      {recon.latest_run && <p className="text-[10px] text-zinc-600 mt-2">Latest run: {recon.latest_run.reconciliation_type} · {recon.latest_run.status} · {recon.latest_run.started_at?.slice(0, 19)}</p>}
    </div>
  );
}