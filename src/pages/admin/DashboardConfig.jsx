import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard, Save } from 'lucide-react';

const DEFAULTS = { default_site: "org", default_range: "current_month", auto_refresh_seconds: 0, comparison_periods: 1, dense_layout: false };

export default function DashboardConfig() {
  const [cfg, setCfg] = useState(() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("dashboard_config") || "{}") }; } catch { return DEFAULTS; } });
  const save = () => { localStorage.setItem("dashboard_config", JSON.stringify(cfg)); alert("Dashboard configuration saved."); };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><LayoutDashboard className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Dashboard Configuration</h1></div>
      <p className="text-sm text-zinc-500">Default landing preferences for the Executive Dashboard. Stored locally per browser.</p>
      <Card><CardHeader><CardTitle className="text-base">Defaults</CardTitle></CardHeader><CardContent className="space-y-3">
        <Field label="Default site scope"><select value={cfg.default_site} onChange={(e) => setCfg({ ...cfg, default_site: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200"><option value="org">Organisation (all sites)</option><option value="first">First site</option></select></Field>
        <Field label="Default date range"><select value={cfg.default_range} onChange={(e) => setCfg({ ...cfg, default_range: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200"><option value="current_month">Current month</option><option value="latest">Latest calculated period</option></select></Field>
        <Field label="Auto-refresh (seconds, 0 = off)"><input type="number" value={cfg.auto_refresh_seconds} onChange={(e) => setCfg({ ...cfg, auto_refresh_seconds: Number(e.target.value) })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-24" /></Field>
        <Field label="Comparison periods"><input type="number" value={cfg.comparison_periods} onChange={(e) => setCfg({ ...cfg, comparison_periods: Number(e.target.value) })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 w-24" /></Field>
        <Field label="Dense layout"><input type="checkbox" checked={cfg.dense_layout} onChange={(e) => setCfg({ ...cfg, dense_layout: e.target.checked })} /></Field>
        <button onClick={save} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20"><Save className="w-4 h-4" /> Save</button>
      </CardContent></Card>
    </div>
  );
}

function Field({ label, children }) { return <div className="flex items-center gap-3"><span className="text-sm text-zinc-400 w-56">{label}</span>{children}</div>; }