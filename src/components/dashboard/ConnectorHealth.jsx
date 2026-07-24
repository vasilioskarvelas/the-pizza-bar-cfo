import React from 'react';
import { Link } from 'react-router-dom';
import { Plug, CheckCircle2, AlertTriangle, Loader, Clock } from 'lucide-react';

export default function ConnectorHealth({ connectors }) {
  if (!connectors) return null;
  const items = [
    { label: "Active", value: connectors.active, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Error", value: connectors.error, icon: AlertTriangle, color: "text-rose-400" },
    { label: "Failed syncs", value: connectors.failed_syncs, icon: AlertTriangle, color: "text-orange-400" },
    { label: "Running", value: connectors.running, icon: Loader, color: "text-sky-400" },
    { label: "Pending", value: connectors.pending_imports, icon: Clock, color: "text-amber-400" },
    { label: "Retry queue", value: connectors.retry_queue, icon: Clock, color: "text-zinc-300" },
  ];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Plug className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Connector Health</h3>
        <Link to="/admin/connectors" className="ml-auto text-[11px] text-amber-400 hover:underline">Manage →</Link>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
        {items.map((it) => { const Icon = it.icon; return (
          <div key={it.label} className="text-center rounded-lg bg-zinc-800/40 p-2">
            <Icon className={`w-4 h-4 mx-auto mb-1 ${it.color}`} />
            <p className="text-lg font-bold tabular-nums text-zinc-100">{it.value}</p>
            <p className="text-[10px] text-zinc-500">{it.label}</p>
          </div>
        ); })}
      </div>
      <div className="space-y-1">
        {(connectors.connectors || []).slice(0, 6).map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${c.status === "active" ? "bg-emerald-400" : c.status === "error" ? "bg-rose-400" : "bg-zinc-500"}`} />
            <span className="text-zinc-300">{c.name}</span>
            <span className="text-zinc-600 ml-auto">{c.source_system}</span>
            {c.last_successful_sync_at && <span className="text-zinc-600">{new Date(c.last_successful_sync_at).toLocaleDateString("en-AU")}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}