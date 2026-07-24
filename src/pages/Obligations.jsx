import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OBLIGATION_LABELS, PRIORITY_STYLE } from '@/lib/forecastFormat';
import { fmtValue } from '@/lib/dashboardFormat';

export default function Obligations() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await base44.functions.invoke("getFutureObligations", { horizon: 12 })); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const obs = data?.obligations || [];
  const byType = {};
  obs.forEach((o) => { if (!byType[o.obligation_type]) byType[o.obligation_type] = []; byType[o.obligation_type].push(o); });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><CalendarClock className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Future Obligations</h1>
            <p className="text-xs text-zinc-500">GST · PAYG · super · payroll · loans · leases · subscriptions · insurance · manual</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Refresh</button>
        </div>

        {loading && !data ? <Spinner /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
              <Tile label="Obligations" value={data?.count ?? 0} />
              <Tile label="Total due" value={fmtValue(data?.total_amount_cents, "cents")} />
              <Tile label="High priority" value={data?.by_priority?.high ?? 0} />
              <Tile label="Critical" value={data?.by_priority?.critical ?? 0} />
            </div>
            {obs.length === 0 ? <p className="text-sm text-zinc-600 py-8 text-center">No obligations scheduled.</p> : (
              <div className="space-y-3">
                {Object.entries(byType).map(([type, items]) => (
                  <div key={type} className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                    <div className="px-3 py-2 bg-zinc-900/60 flex items-center gap-2">
                      <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">{OBLIGATION_LABELS[type] || type}</span>
                      <span className="text-xs text-zinc-600">{items.length}</span>
                      <span className="ml-auto text-xs text-zinc-500 tabular-nums">{fmtValue(items.reduce((s,o)=>s+(o.amount_cents||0),0), "cents")}</span>
                    </div>
                    <div className="divide-y divide-zinc-800/60">
                      {items.map((o, i) => {
                        const ps = PRIORITY_STYLE[o.priority] || PRIORITY_STYLE.medium;
                        const overdue = o.status === "overdue";
                        return (
                          <div key={o.source_ref || i} className="flex items-center gap-3 px-3 py-2">
                            <div className="flex-1">
                              <p className="text-sm text-zinc-200">{o.name}</p>
                              <p className="text-[11px] text-zinc-500">Due {o.due_date} · {o.frequency}</p>
                            </div>
                            {overdue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">Overdue</span>}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ps} uppercase`}>{o.priority}</span>
                            <span className="text-sm tabular-nums text-zinc-200 w-24 text-right">{fmtValue(o.amount_cents, "cents")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
function Tile({ label, value }) { return <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"><p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p><p className="text-xl font-bold tabular-nums text-zinc-100">{value}</p></div>; }
function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }