import React, { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatAUD } from '@/lib/autopilotEngine';
import { useAccess, isPlatformAdmin } from '@/lib/accessService';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { UploadCloud, Loader2, AlertTriangle, TrendingUp, Info, CheckCircle2 } from 'lucide-react';

// Weekly performance per shop, fed by the KPI spreadsheet (importKpiSheet → WeeklyChannelKPI).

const pct = (p) => (p == null ? '—' : `${p >= 0 ? '+' : ''}${(p * 100).toFixed(1)}%`);
const pctClass = (p) => (p == null ? 'text-slate-400' : p >= 0 ? 'text-emerald-600' : 'text-rose-600');
const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const whole = (c) => formatAUD(c == null ? null : Math.round(c / 100) * 100);

export default function LastWeek() {
  const access = useAccess();
  const canImport = isPlatformAdmin(access);
  const [data, setData] = useState(null);
  const [week, setWeek] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async (weekEnding) => {
    setError(null);
    try {
      const res = await base44.functions.invoke('getWeeklyPerformance', weekEnding ? { week_ending: weekEnding } : {});
      const d = res.data || res;
      if (d.error) throw new Error(d.error);
      setData(d);
      setWeek(d.week_ending || '');
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Could not load weekly performance');
      setData((prev) => prev || { sites: [], weeks_available: [] });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) {
    return <div className="p-8 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;
  }

  const empty = !data.sites?.length;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Last Week</h1>
          <p className="text-slate-500 mt-1">
            {empty ? 'Weekly sales by shop and channel, from your KPI sheet.' : `Week ending ${fmtDate(data.week_ending)} · Monday to Sunday`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!!data.weeks_available?.length && (
            <select value={week} onChange={(e) => load(e.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm" aria-label="Week ending">
              {data.weeks_available.map((w) => <option key={w} value={w}>Week ending {fmtDate(w)}</option>)}
            </select>
          )}
          {canImport && <KpiSheetUpload onImported={() => load()} />}
        </div>
      </div>

      {error && <Banner tone="error">{error}</Banner>}
      {empty && !error && (
        <Banner tone="info">No weekly data yet. {canImport ? 'Upload your KPI sheet (KPI SHEET - THE PIZZA BAR.xlsx) to get started.' : 'Ask an owner to upload the KPI sheet.'}</Banner>
      )}

      {!empty && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Both shops · sales" value={whole(data.combined.gross)} sub={<span className={pctClass(data.combined.vs_prev_pct)}>{pct(data.combined.vs_prev_pct)} vs prior week</span>} />
            <Stat label="Both shops · after commission" value={whole(data.combined.net)} sub={`${data.combined.gross ? Math.round((data.combined.net / data.combined.gross) * 100) : 0}% kept`} />
            <Stat label="Orders" value={data.combined.orders.toLocaleString('en-AU')} />
            <Stat label="Average order" value={formatAUD(data.combined.aov, true)} />
          </div>
          {data.sites.map((s) => <SiteCard key={s.site_id} site={s} />)}
          {data.last_import_at && <p className="text-xs text-slate-400">Last updated from the KPI sheet {new Date(data.last_import_at).toLocaleString('en-AU')}.</p>}
        </>
      )}
    </div>
  );
}

function SiteCard({ site }) {
  if (!site.has_data) {
    return (
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900">{site.site_name}</h2>
        <p className="text-sm text-slate-500 mt-1">No figures entered for this week yet.</p>
      </section>
    );
  }
  const t = site.totals;
  const trendData = site.trend.map((p) => ({ week: fmtDate(p.week_ending).replace(/ \d{4}$/, ''), Sales: Math.round(p.gross / 100), 'After commission': Math.round(p.net / 100) }));

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{site.site_name}</h2>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{whole(t.gross)}</span> sales ·{' '}
          <span className={pctClass(site.vs_prev_pct)}>{pct(site.vs_prev_pct)}</span> vs prior week ·{' '}
          <span className={pctClass(site.vs_avg4_pct)}>{pct(site.vs_avg4_pct)}</span> vs 4-week avg
        </p>
      </div>

      {!!site.flags.length && (
        <ul className="space-y-1.5">
          {site.flags.map((f, i) => <Flag key={i} flag={f} />)}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3 font-medium">Channel</th>
              <th className="py-2 px-3 font-medium text-right">Sales</th>
              <th className="py-2 px-3 font-medium text-right">Commission</th>
              <th className="py-2 px-3 font-medium text-right">You keep</th>
              <th className="py-2 px-3 font-medium text-right">Orders</th>
              <th className="py-2 px-3 font-medium text-right">Avg order</th>
              <th className="py-2 px-3 font-medium text-right">vs prior wk</th>
              <th className="py-2 pl-3 font-medium text-right">vs 4-wk avg</th>
            </tr>
          </thead>
          <tbody>
            {site.channels.map((c) => (
              <tr key={c.channel} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 text-slate-800">{c.label}{c.missing && <span className="ml-2 text-xs text-amber-600">not entered</span>}</td>
                <td className="py-2 px-3 text-right tabular-nums">{c.missing ? '—' : formatAUD(c.gross, true)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-500">{c.commission ? formatAUD(c.commission, true) : '—'}</td>
                <td className="py-2 px-3 text-right tabular-nums">{c.missing ? '—' : <>{formatAUD(c.net, true)} <span className="text-xs text-slate-400">{c.keep_pct != null ? `${Math.round(c.keep_pct * 100)}%` : ''}</span></>}</td>
                <td className="py-2 px-3 text-right tabular-nums">{c.orders || '—'}</td>
                <td className="py-2 px-3 text-right tabular-nums">{c.aov ? formatAUD(c.aov, true) : '—'}</td>
                <td className={`py-2 px-3 text-right tabular-nums ${pctClass(c.vs_prev_pct)}`}>{c.missing ? '—' : pct(c.vs_prev_pct)}</td>
                <td className={`py-2 pl-3 text-right tabular-nums ${pctClass(c.vs_avg4_pct)}`}>{c.missing ? '—' : pct(c.vs_avg4_pct)}</td>
              </tr>
            ))}
            <tr className="font-semibold text-slate-900">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatAUD(t.gross, true)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatAUD(t.commission, true)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatAUD(t.net, true)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{t.orders || '—'}</td>
              <td className="py-2 px-3 text-right tabular-nums">{t.aov ? formatAUD(t.aov, true) : '—'}</td>
              <td className={`py-2 px-3 text-right tabular-nums ${pctClass(site.vs_prev_pct)}`}>{pct(site.vs_prev_pct)}</td>
              <td className={`py-2 pl-3 text-right tabular-nums ${pctClass(site.vs_avg4_pct)}`}>{pct(site.vs_avg4_pct)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {trendData.length > 1 && (
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-2">Last {trendData.length} weeks</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={48} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString('en-AU')}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Sales" stroke="#0f172a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="After commission" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function Flag({ flag }) {
  const Icon = flag.severity === 'warning' ? AlertTriangle : flag.severity === 'positive' ? TrendingUp : Info;
  const tone = flag.severity === 'warning' ? 'text-rose-700 bg-rose-50 border-rose-200'
    : flag.severity === 'positive' ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : 'text-slate-600 bg-slate-50 border-slate-200';
  return (
    <li className={`flex items-start gap-2 text-sm border rounded-md px-3 py-2 ${tone}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" /><span>{flag.message}</span>
    </li>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900 mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs mt-1 text-slate-500">{sub}</p>}
    </div>
  );
}

function Banner({ tone, children }) {
  const cls = tone === 'error' ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-slate-700 bg-white border-slate-200';
  return <div className={`flex items-start gap-2 text-sm border rounded-md p-3 ${cls}`}>{tone === 'error' ? <AlertTriangle className="w-4 h-4 mt-0.5" /> : <Info className="w-4 h-4 mt-0.5" />}<span>{children}</span></div>;
}

function KpiSheetUpload({ onImported }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handle(file) {
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.functions.invoke('importKpiSheet', { file_url: up.file_url });
      const d = res.data || res;
      if (d.error) throw new Error(d.error);
      setResult({ ok: true, text: `${d.created} new, ${d.updated} updated, ${d.unchanged} unchanged`, warnings: d.warnings || [] });
      onImported?.();
    } catch (e) {
      setResult({ ok: false, text: e?.response?.data?.error || e.message || 'Import failed', warnings: e?.response?.data?.warnings || [] });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        className="h-9 inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
        {busy ? 'Importing…' : 'Update from KPI sheet'}
      </button>
      <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      {result && (
        <div className={`absolute right-0 mt-2 w-80 z-10 rounded-md border p-3 text-xs shadow-sm ${result.ok ? 'bg-white border-emerald-200' : 'bg-white border-rose-200'}`}>
          <p className={`flex items-center gap-1.5 font-medium ${result.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
            {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{result.text}
          </p>
          {!!result.warnings.length && (
            <ul className="mt-2 space-y-1 text-slate-500 list-disc pl-4 max-h-40 overflow-auto">
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          <button type="button" onClick={() => setResult(null)} className="mt-2 text-slate-400 hover:text-slate-600">Dismiss</button>
        </div>
      )}
    </div>
  );
}
