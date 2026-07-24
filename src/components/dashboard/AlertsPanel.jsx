import React from 'react';
import { CheckCircle2, AlertCircle, Bell } from 'lucide-react';
import { SEV_STYLE, timeAgo } from '@/lib/dashboardFormat';
import { base44 } from '@/api/base44Client';

export default function AlertsPanel({ alerts, summary, onAction, onChanged }) {
  const act = async (id, action) => { onAction && onAction(id, action); await base44.functions.invoke("acknowledgeAlert", { alert_id: id, action }); onChanged && onChanged(); };
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Executive Alerts</h3>
        <span className="ml-auto text-xs text-zinc-500">{summary?.critical || 0} critical · {summary?.high || 0} high</span>
      </div>
      {(!alerts || alerts.length === 0) ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500 py-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> No active alerts — all clear.
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-auto">
          {alerts.map((a) => {
            const s = SEV_STYLE[a.severity] || SEV_STYLE.medium;
            return (
              <div key={a.id} className={`rounded-lg border ${s.border} ${s.bg} p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                  <span className={`text-xs font-semibold ${s.text}`}>{s.label}</span>
                  <span className="text-sm text-zinc-200 font-medium">{a.title}</span>
                  {a.resolved && <span className="text-[10px] text-emerald-400">resolved</span>}
                  {a.acknowledged && !a.resolved && <span className="text-[10px] text-sky-400">ack</span>}
                </div>
                <p className="text-xs text-zinc-400 mb-1">{a.reason}</p>
                <p className="text-[11px] text-zinc-600 mb-2"><span className="text-zinc-500">Impact:</span> {a.business_impact} <span className="text-zinc-500 ml-2">Action:</span> {a.recommended_action}</p>
                <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                  <AlertCircle className="w-3 h-3" /> {a.affected_metric} · {timeAgo(a.created_date)}
                  {!a.resolved && <button onClick={() => act(a.id, "acknowledge")} className="ml-auto px-2 py-0.5 rounded border border-zinc-700 hover:border-sky-500/40 hover:text-sky-300">Acknowledge</button>}
                  {!a.resolved && <button onClick={() => act(a.id, "resolve")} className="px-2 py-0.5 rounded border border-zinc-700 hover:border-emerald-500/40 hover:text-emerald-300">Resolve</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}