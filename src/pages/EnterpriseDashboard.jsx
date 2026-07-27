import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Building2, RefreshCw, ShieldCheck, AlertTriangle, FileText, Sparkles, TrendingUp, Users } from 'lucide-react';
import { fmtValue } from '@/lib/dashboardFormat';

export default function EnterpriseDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getEnterpriseDashboard', {});
      setData(res);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const t = data?.dashboard?.totals || {};
  const perOrg = data?.dashboard?.per_org || [];
  const obligations = data?.dashboard?.upcoming_obligations || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><Building2 className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Enterprise Dashboard</h1>
            <p className="text-xs text-zinc-500">Multi-tenant overview · engine {data?.engine_version || '—'} · {data?.generated_at?.slice(0, 10)}</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>

        {loading ? <Spinner /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
              <Tile icon={Building2} label="Organisations" value={t.organisations} sub={`${t.active_organisations} active`} />
              <Tile icon={Building2} label="Sites" value={t.sites} sub={`${t.active_sites} active`} />
              <Tile icon={Users} label="Active users" value={t.active_users} />
              <Tile icon={ShieldCheck} label="Open compliance" value={t.open_compliance} sub={`${t.overdue_compliance} overdue`} warn={t.overdue_compliance > 0} />
              <Tile icon={FileText} label="Weekly reports" value={t.weekly_reports} sub={`${t.ai_summaries} AI summaries`} />
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 mb-5">
              <h2 className="text-sm font-semibold text-zinc-200 mb-3">Organisations</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                    <th className="py-2 font-medium">Organisation</th><th className="font-medium">Type</th><th className="font-medium">Status</th>
                    <th className="text-right font-medium">Sites</th><th className="text-right font-medium">Revenue</th><th className="text-right font-medium">Net Profit</th>
                    <th className="text-right font-medium">Owner Score</th><th className="text-right font-medium">Compliance</th>
                  </tr></thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {perOrg.map((o) => (
                      <tr key={o.id} className="hover:bg-zinc-800/30">
                        <td className="py-2 text-zinc-200 font-medium">{o.name}</td>
                        <td className="text-zinc-500">{o.type || 'independent'}</td>
                        <td><StatusBadge status={o.status} /></td>
                        <td className="text-right tabular-nums text-zinc-300">{o.sites}</td>
                        <td className="text-right tabular-nums text-zinc-300">{o.revenue != null ? fmtValue(o.revenue, 'cents') : '—'}</td>
                        <td className="text-right tabular-nums text-zinc-300">{o.net_profit != null ? fmtValue(o.net_profit, 'cents') : '—'}</td>
                        <td className="text-right tabular-nums text-zinc-300">{o.owner_score != null ? Math.round(o.owner_score) : '—'}</td>
                        <td className="text-right tabular-nums"><span className={o.overdue_compliance ? 'text-rose-400' : 'text-zinc-400'}>{o.open_compliance}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h2 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Upcoming obligations</h2>
                {obligations.length === 0 ? <p className="text-xs text-zinc-600">No upcoming obligations.</p> : (
                  <ul className="space-y-2">
                    {obligations.map((o) => <li key={o.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-300">{o.title} <span className="text-zinc-600">· {o.type}</span></span>
                      <span className="text-xs text-zinc-500">{o.due_date}</span>
                      <ObligationStatus status={o.status} />
                    </li>)}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h2 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-amber-400" /> Enterprise analytics</h2>
                <Link to="/enterprise-analytics" className="text-sm text-amber-300 hover:underline">Open cross-organisation benchmarking →</Link>
                <div className="mt-3 space-y-1 text-xs text-zinc-500">
                  <p><Sparkles className="inline w-3 h-3" /> AI summaries: {t.ai_summaries}</p>
                  <p><FileText className="inline w-3 h-3" /> Weekly reports: {t.weekly_reports}</p>
                  <p>Total revenue: {t.revenue != null ? fmtValue(t.revenue, 'cents') : '—'}</p>
                  <p>Total net profit: {t.net_profit != null ? fmtValue(t.net_profit, 'cents') : '—'}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, warn }) {
  return <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4">
    <div className="flex items-center gap-2 mb-1"><Icon className="w-4 h-4 text-zinc-500" /><span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</span></div>
    <p className={`text-2xl font-bold tabular-nums ${warn ? 'text-rose-400' : 'text-zinc-100'}`}>{value}</p>
    {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
  </div>;
}
function StatusBadge({ status }) {
  const s = { active: 'text-emerald-400 bg-emerald-500/10', suspended: 'text-rose-400 bg-rose-500/10', inactive: 'text-zinc-500 bg-zinc-800' }[status] || 'text-zinc-500 bg-zinc-800';
  return <span className={`text-xs px-2 py-0.5 rounded ${s}`}>{status}</span>;
}
function ObligationStatus({ status }) {
  const s = { overdue: 'text-rose-400', due_soon: 'text-amber-400', upcoming: 'text-sky-400', filed: 'text-emerald-400', paid: 'text-emerald-400', done: 'text-emerald-400' }[status] || 'text-zinc-400';
  return <span className={`text-xs px-2 py-0.5 rounded bg-zinc-800 ${s}`}>{status}</span>;
}
function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }