import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

const GOALS = ['Increase Profit', 'Reduce Labour', 'Reduce Expenses', 'Improve Cash Flow', 'Increase Sales', 'Reduce Debt', 'Reduce Waste'];

export default function Settings() {
  const [settings, setSettings] = useState({ business_name: 'Pizza Bar Strathmore', industry: 'hospitality', country: 'AU', currency: 'AUD', employees: '12', revenue_range: '1m-3m', accounting: 'Xero', pos: 'Square', payroll: 'Deputy', goals: ['Increase Profit', 'Reduce Labour'], target_labour: 30, target_cogs: 30, target_net: 15 });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    base44.entities.PlatformSetting.filter({ setting_key: { $in: ['ba_business_profile', 'ba_targets'] } }).then((rows) => {
      for (const r of rows) {
        try {
          const val = JSON.parse(r.setting_value);
          if (r.setting_key === 'ba_business_profile') setSettings((s) => ({ ...s, ...val }));
          if (r.setting_key === 'ba_targets') setSettings((s) => ({ ...s, ...val }));
        } catch {}
      }
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const profile = { business_name: settings.business_name, industry: settings.industry, country: settings.country, currency: settings.currency, employees: settings.employees, revenue_range: settings.revenue_range, accounting: settings.accounting, pos: settings.pos, payroll: settings.payroll, goals: settings.goals };
      const targets = { target_labour: Number(settings.target_labour), target_cogs: Number(settings.target_cogs), target_net: Number(settings.target_net) };
      await upsertSetting('ba_business_profile', JSON.stringify(profile));
      await upsertSetting('ba_targets', JSON.stringify(targets));
      toast({ title: 'Settings saved' });
    } catch (e) {
      toast({ title: 'Could not save', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const upsertSetting = async (key, value) => {
    const existing = await base44.entities.PlatformSetting.filter({ setting_key: key });
    if (existing.length) await base44.entities.PlatformSetting.update(existing[0].id, { setting_value: value });
    else await base44.entities.PlatformSetting.create({ setting_key: key, setting_value: value, category: 'business_autopilot' });
  };

  const toggleGoal = (g) => setSettings((s) => ({ ...s, goals: s.goals.includes(g) ? s.goals.filter((x) => x !== g) : [...s.goals, g] }));

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-semibold text-slate-900">Settings</h1>
      <p className="text-slate-500 mt-1">Business profile, targets and connected platforms.</p>

      <Section title="Business Profile">
        <Field label="Business Name"><Input value={settings.business_name} onChange={(v) => setSettings({ ...settings, business_name: v })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Industry"><Select value={settings.industry} onChange={(v) => setSettings({ ...settings, industry: v })} options={['hospitality', 'plumbing', 'electrical', 'construction', 'hvac', 'retail', 'ecommerce', 'professional_services']} /></Field>
          <Field label="Country"><Select value={settings.country} onChange={(v) => setSettings({ ...settings, country: v })} options={['AU', 'NZ', 'US', 'UK']} /></Field>
          <Field label="Currency"><Select value={settings.currency} onChange={(v) => setSettings({ ...settings, currency: v })} options={['AUD', 'NZD', 'USD', 'GBP']} /></Field>
          <Field label="Number of Employees"><Input value={settings.employees} onChange={(v) => setSettings({ ...settings, employees: v })} /></Field>
          <Field label="Annual Revenue Range"><Select value={settings.revenue_range} onChange={(v) => setSettings({ ...settings, revenue_range: v })} options={['under_500k', '500k-1m', '1m-3m', '3m-5m', '5m-plus']} /></Field>
        </div>
      </Section>

      <Section title="Connected Platforms">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Accounting"><Input value={settings.accounting} onChange={(v) => setSettings({ ...settings, accounting: v })} /></Field>
          <Field label="POS / Jobs"><Input value={settings.pos} onChange={(v) => setSettings({ ...settings, pos: v })} /></Field>
          <Field label="Payroll"><Input value={settings.payroll} onChange={(v) => setSettings({ ...settings, payroll: v })} /></Field>
        </div>
      </Section>

      <Section title="Business Goals">
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <button key={g} onClick={() => toggleGoal(g)} className={`text-xs px-3 py-1.5 rounded-full border ${settings.goals.includes(g) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>{g}</button>
          ))}
        </div>
      </Section>

      <Section title="Targets">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Target Labour %"><Input type="number" value={settings.target_labour} onChange={(v) => setSettings({ ...settings, target_labour: v })} /></Field>
          <Field label="Target COGS %"><Input type="number" value={settings.target_cogs} onChange={(v) => setSettings({ ...settings, target_cogs: v })} /></Field>
          <Field label="Target Net Profit %"><Input type="number" value={settings.target_net} onChange={(v) => setSettings({ ...settings, target_net: v })} /></Field>
        </div>
      </Section>

      <button onClick={save} disabled={saving} className="mt-6 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50">{saving ? 'Saving…' : 'Save settings'}</button>
    </div>
  );
}

function Section({ title, children }) {
  return <div className="bg-white rounded-xl border border-slate-200 p-5 mt-4"><h3 className="font-semibold text-slate-900 mb-3">{title}</h3>{children}</div>;
}
function Field({ label, children }) {
  return <label className="block"><span className="text-xs text-slate-500">{label}</span><div className="mt-1">{children}</div></label>;
}
function Input({ value, onChange, type }) {
  return <input type={type || 'text'} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />;
}
function Select({ value, onChange, options }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900">{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}