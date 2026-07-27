import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const FIELDS = [
  { code: 'revenue', label: 'Revenue', dir: 'maximize' },
  { code: 'net_profit', label: 'Net Profit', dir: 'maximize' },
  { code: 'cash', label: 'Cash', dir: 'maximize' },
  { code: 'labour_pct', label: 'Labour %', dir: 'minimize' },
  { code: 'food_cost_pct', label: 'Food Cost %', dir: 'minimize' },
  { code: 'debt', label: 'Debt', dir: 'minimize' },
  { code: 'owner_score', label: 'Owner Score', dir: 'maximize' },
  { code: 'goal_completion_pct', label: 'Goal Completion %', dir: 'maximize' },
  { code: 'open_risks', label: 'Open Risks', dir: 'minimize' },
];

export default function EnterpriseAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { setData(await base44.functions.invoke('getEnterpriseAnalytics', {})); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const orgs = data?.organisations || [];
  const metrics = data?.metrics_by_org || {};
  const bm = data?.benchmarks || {};

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Cross-Organisation Analytics</h1>
            <p className="text-xs text-zinc-500">Benchmarking across {orgs.length} organisation(s) · engine {data?.engine_version || '—'}</p>
          </div>
          <Link to="/enterprise-dashboard" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Enterprise Dashboard</Link>
        </div>
        {loading ? <Spinner /> : orgs.length === 0 ? <Empty /> : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                <th className="px-3 py-2 font-medium">Organisation</th>
                {FIELDS.map((f) => <th key={f.code} className="text-right font-medium">{f.label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-zinc-800/60">
                {orgs.map((o) => (
                  <tr key={o.id} className="hover:bg-zinc-800/30">
                    <td className="px-3 py-2 text-zinc-200 font-medium">{o.name}</td>
                    {FIELDS.map((f) => {
                      const v = metrics[o.id]?.[f.code];
                      const r = bm[f.code]?.ranks?.[o.id];
                      return <td key={f.code} className="text-right tabular-nums">
                        <span className="text-zinc-300">{v != null ? fmt(v, f.code) : '—'}</span>
                        {r?.rank != null && <span className="ml-1 text-[10px] text-zinc-600">#{r.rank}/{orgs.length}</span>}
                      </td>;
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t border-zinc-800 text-xs text-zinc-500">
                <td className="px-3 py-2">Mean</td>
                {FIELDS.map((f) => <td key={f.code} className="text-right tabular-nums">{bm[f.code]?.mean != null ? fmt(bm[f.code].mean, f.code) : '—'}</td>)}
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
function fmt(v, code) {
  if (['revenue','net_profit','cash','debt'].includes(code)) return '$' + Math.round(v).toLocaleString();
  if (['labour_pct','food_cost_pct','goal_completion_pct'].includes(code)) return (Math.round(v * 100) / 100) + '%';
  return Math.round(v * 100) / 100;
}
function Empty() { return <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center text-sm text-zinc-500">No organisations to benchmark.</div>; }
function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }