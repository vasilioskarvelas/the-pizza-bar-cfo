import React from 'react';
import { RefreshCw, Building2, Calendar } from 'lucide-react';

export default function DashboardToolbar({ period, siteId, sites, loading, onPeriod, onSite, onRefresh }) {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    months.push({ label: d.toLocaleString("en-AU", { month: "long", year: "numeric" }), value: `${d.toISOString().slice(0, 10)}|${end.toISOString().slice(0, 10)}` });
  }
  const current = period ? `${period.periodStart}|${period.periodEnd}` : "";
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-zinc-500" />
        <select value={siteId || ""} onChange={(e) => onSite(e.target.value || null)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/40">
          <option value="">All sites (Organisation)</option>
          {(sites || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-zinc-500" />
        <select value={current} onChange={(e) => { const [s, en] = e.target.value.split("|"); onPeriod({ periodStart: s, periodEnd: en }); }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/40">
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <button onClick={onRefresh} disabled={loading}
        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:text-amber-300 hover:border-amber-500/30 disabled:opacity-50">
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
      </button>
    </div>
  );
}