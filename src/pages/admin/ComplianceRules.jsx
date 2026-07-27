import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ShieldCheck, Plus, Trash2 } from 'lucide-react';

const TYPES = ['bas','gst','payg','super','payroll','asic','annual_review','business_registration','insurance','licence'];
const TYPE_LABEL = { bas: 'BAS', gst: 'GST', payg: 'PAYG', super: 'Super', payroll: 'Payroll', asic: 'ASIC', annual_review: 'Annual Review', business_registration: 'Registration', insurance: 'Insurance', licence: 'Licence' };

const DEFAULTS = [
  { rule_key: 'bas_quarterly', compliance_type: 'bas', title: 'Quarterly BAS', default_reminder_days: 14, default_recurrence: 'quarterly', default_owner_role: 'accountant' },
  { rule_key: 'super_quarterly', compliance_type: 'super', title: 'Superannuation Guarantee', default_reminder_days: 14, default_recurrence: 'quarterly', default_owner_role: 'accountant' },
  { rule_key: 'payg_withholding', compliance_type: 'payg', title: 'PAYG Withholding', default_reminder_days: 7, default_recurrence: 'monthly', default_owner_role: 'accountant' },
  { rule_key: 'asic_annual_review', compliance_type: 'asic', title: 'ASIC Annual Review', default_reminder_days: 30, default_recurrence: 'yearly', default_owner_role: 'organisation_owner' },
  { rule_key: 'insurance_renewal', compliance_type: 'insurance', title: 'Insurance Renewal', default_reminder_days: 30, default_recurrence: 'yearly', default_owner_role: 'operations_manager' },
];

export default function AdminComplianceRules() {
  const [rules, setRules] = useState([]);
  const [orgId, setOrgId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ rule_key: '', compliance_type: 'bas', title: '', default_reminder_days: 7, default_recurrence: 'quarterly', default_owner_role: 'accountant' });

  const load = async () => { try { setRules(await base44.entities.ComplianceRule.list() || []); } catch { setRules([]); } };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const seed = async () => { if (!orgId) return; for (const d of DEFAULTS) { try { await base44.entities.ComplianceRule.create({ ...d, organisation_id: orgId }); } catch {} } load(); };
  const create = async () => {
    if (!form.rule_key || !form.title || !orgId) return;
    try { await base44.entities.ComplianceRule.create({ ...form, organisation_id: orgId }); setForm({ rule_key: '', compliance_type: 'bas', title: '', default_reminder_days: 7, default_recurrence: 'quarterly', default_owner_role: 'accountant' }); setShowForm(false); load(); }
    catch (e) { alert(e.message); }
  };
  const toggle = async (r) => { await base44.entities.ComplianceRule.update(r.id, { enabled: !r.enabled }); load(); };
  const del = async (r) => { await base44.entities.ComplianceRule.delete(r.id); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Compliance Rules</h1>
        <button onClick={seed} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Seed defaults</button>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button></div>
      <p className="text-sm text-zinc-500">Default templates for compliance obligations — reminder cadence, owner role and recurrence applied when items are created.</p>

      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <F label="Rule key"><input value={form.rule_key} onChange={(e) => setForm({ ...form, rule_key: e.target.value })} className="inp" /></F>
          <F label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="inp" /></F>
          <F label="Type"><select value={form.compliance_type} onChange={(e) => setForm({ ...form, compliance_type: e.target.value })} className="inp">{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></F>
          <F label="Reminder days"><input type="number" value={form.default_reminder_days} onChange={(e) => setForm({ ...form, default_reminder_days: Number(e.target.value) })} className="inp" /></F>
          <F label="Recurrence"><select value={form.default_recurrence} onChange={(e) => setForm({ ...form, default_recurrence: e.target.value })} className="inp">{['one_off','monthly','quarterly','yearly'].map((r) => <option key={r} value={r}>{r}</option>)}</select></F>
          <F label="Owner role"><input value={form.default_owner_role} onChange={(e) => setForm({ ...form, default_owner_role: e.target.value })} className="inp" /></F>
          <div className="col-span-3"><button onClick={create} className="text-sm px-4 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">Create rule</button></div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800/60">
        {rules.length === 0 ? <p className="text-sm text-zinc-600 p-6">No rules. Click "Seed defaults" to load the standard compliance templates.</p> :
          rules.map((r) => <div key={r.id} className="flex items-center gap-3 p-3">
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{TYPE_LABEL[r.compliance_type] || r.compliance_type}</span>
            <div><p className="text-sm text-zinc-200 font-medium">{r.title}</p><p className="text-xs text-zinc-500">{r.default_recurrence} · remind {r.default_reminder_days}d · owner {r.default_owner_role || '—'}</p></div>
            <button onClick={() => toggle(r)} className={`ml-auto text-xs px-2 py-1 rounded border ${r.enabled ? 'border-emerald-500/30 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}>{r.enabled ? 'Enabled' : 'Disabled'}</button>
            <button onClick={() => del(r)} className="text-zinc-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
          </div>)}
      </div>
      <style>{`.inp{background:#09090b;border:1px solid #27272a;border-radius:0.375rem;padding:0.375rem 0.5rem;font-size:0.875rem;width:100%}`}</style>
    </div>
  );
}
function F({ label, children }) { return <div><label className="text-xs text-zinc-500 block mb-1">{label}</label>{children}</div>; }