import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Activity } from 'lucide-react';

const FILTERS = ["all", "calculation", "owner_score", "reconciliation", "connector", "methodology", "configuration", "audit", "alert"];

export default function ActivityTimeline({ siteId, limit = 50 }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    base44.functions.invoke("getDashboardTimeline", { site_id: siteId, filter: filter === "all" ? null : filter, limit })
      .then((r) => setItems(r.items || [])).catch(() => setItems([])).finally(() => setLoading(false));
  }, [siteId, filter, limit]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Activity className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Activity Timeline</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="ml-auto bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200">
          {FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {loading ? <p className="text-sm text-zinc-500 py-4 text-center">Loading…</p> : items.length === 0 ? (
        <p className="text-sm text-zinc-600 py-4 text-center">No activity.</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-auto">
          {items.map((it) => (
            <div key={it.id} className="flex items-start gap-2 text-xs">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${it.severity === "critical" ? "bg-rose-400" : it.severity === "warning" ? "bg-amber-400" : "bg-zinc-500"}`} />
              <div className="min-w-0">
                <p className="text-zinc-300 truncate">{it.title}</p>
                <p className="text-zinc-600">{it.type} · {it.timestamp?.slice(0, 19).replace("T", " ")}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}