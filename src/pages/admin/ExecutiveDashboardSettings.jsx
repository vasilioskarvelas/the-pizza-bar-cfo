import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Settings, Save, RefreshCw } from 'lucide-react';

export default function ExecutiveDashboardSettings() {
  const [settings, setSettings] = useState(null);
  const [orgId, setOrgId] = useState(null);

  const load = async () => {
    try { const recs = await base44.entities.ExecutiveDashboardSetting.list() || []; setSettings(recs[0] || null); } catch { setSettings(null); }
  };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const save = async () => {
    if (!orgId) return;
    const body = {
      organisation_id: orgId, site_id: null,
      scorecard_metrics: JSON.stringify(settings.scorecard_metrics || []),
      default_horizon_months: Number(settings.default_horizon_months) || 12, roadview_view: settings.roadview_view || "quarterly",
      notify_goal_overdue: !!settings.notify_goal_overdue, notify_initiative_overdue: !!settings.notify_initiative_overdue,
      notify_forecast_miss: !!settings.notify_forecast_miss, notify_risk_escalation: !!settings.notify_risk_escalation,
      notify_goal_achieved: !!settings.notify_goal_achieved, notify_score_milestone: !!settings.notify_score_milestone,
      notify_cash_milestone: !!settings.notify_cash_milestone, notify_debt_milestone: !!settings.notify_debt_milestone,
    };
    if (settings.id) await base44.entities.ExecutiveDashboardSetting.update(settings.id, body);
    else { const rec = await base44.entities.ExecutiveDashboardSetting.create(body); setSettings(rec); }
    load();
  };

  if (!settings) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2"><Settings className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Executive Dashboard Settings</h1>
          <button onClick={() => setSettings({ default_horizon_months: 12, roadview_view: "quarterly", notify_goal_overdue: true, notify_initiative_overdue: true, notify_forecast_miss: true, notify_risk_escalation: true, notify_goal_achieved: true, notify_score_milestone: true, notify_cash_milestone: true, notify_debt_milestone: true, scorecard_metrics: [] })} className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">Create defaults</button>
        </div>
        <p className="text-sm text-zinc-600 p-6 text-center">No settings yet. Click "Create defaults".</p>
      </div>
    );
  }

  const toggle = (k) => setSettings({ ...settings, [k]: !settings[k] });
  const checks = [["notify_goal_overdue","Goal overdue"],["notify_initiative_overdue","Initiative overdue"],["notify_forecast_miss","Forecast miss"],["notify_risk_escalation","Risk escalation"],["notify_goal_achieved","Goal achieved"],["notify_score_milestone","Owner Score milestone"],["notify_cash_milestone","Cash milestone"],["notify_debt_milestone","Debt milestone"]];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Settings className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Executive Dashboard Settings</h1>
        <button onClick={save} className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
        <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /></button></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-200">Display</h3>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Default horizon (months)<input type="number" value={settings.default_horizon_months || 12} onChange={(e) => setSettings({ ...settings, default_horizon_months: Number(e.target.value) })} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" /></label>
          <label className="text-xs text-zinc-400 flex flex-col gap-1">Roadmap view<select value={settings.roadview_view || "quarterly"} onChange={(e) => setSettings({ ...settings, roadview_view: e.target.value })} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200"><option value="quarterly">quarterly</option><option value="annual">annual</option></select></label>
        </div>
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-zinc-200">Notifications</h3>
          {checks.map(([k, label]) => (
            <button key={k} onClick={() => toggle(k)} className="flex items-center gap-2 text-sm w-full text-left">
              <span className={`w-4 h-4 rounded border flex items-center justify-center ${settings[k] ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "border-zinc-700 text-transparent"}`}>✓</span>
              <span className="text-zinc-300">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}