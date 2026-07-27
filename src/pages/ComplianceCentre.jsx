import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { ShieldCheck, RefreshCw, Plus } from 'lucide-react';

const TYPES = ['bas','gst','payg','super','payroll','asic','annual_review','business_registration','insurance','licence'];
const TYPE_LABEL = { bas: 'BAS', gst: 'GST', payg: 'PAYG', super: 'Super', payroll: 'Payroll', asic: 'ASIC', annual_review: 'Annual Review', business_registration: 'Registration', insurance: 'Insurance', licence: 'Licence' };
const STAT_STYLE = { overdue: 'text-rose-400 bg-rose-500/10', due_soon: 'text-amber-400 bg-amber-500/10', upcoming: 'text-sky-400 bg-sky-500/10', filed: 'text-emerald-400 bg-emerald-500/10', paid: 'text-emerald-400 bg-emerald-500/10', done: 'text-emerald-400 bg-emerald-500/10', waived: 'text-zinc-400 bg-zinc-800' };

export default function ComplianceCentre() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ compliance_type: 'bas', title: '', due_date: '', amount_cents: '', recurrence: 'one_off', reminder_days: 7, notes: '' });

  const load = async () => {
    setLoading(true);
    try { setData(await base44.functions.invoke('getComplianceCentre', {})); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title || !form.due_date) return;
    try {
      await base44.functions.invoke('createComplianceItem', { ...form, amount_cents: form.amount_cents ? Number(form.amount_cents) : 0 });
      setForm({ compliance_type: 'bas', title: '', due_date: '', amount_cents: '', recurrence: 'one_off', reminder_days: 7, notes: '' });
      setShowForm(false);
      load();
    } catch (e) { alert(e.message); }
  };
  const setStatus = async (item, status) => {
    try { await base44.functions.invoke('updateComplianceItem', { id: item.id, status }); load(); } catch (e) { alert(e.message); }
  };

  const s = data?.summary || {};
  const items = data?.items || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><ShieldCheck className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Compliance Centre</h1>
            <p className="text-xs text-zinc-500">BAS · GST · PAYG · Super · ASIC · registrations · insurance · licences</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          <button onClick={() => setShowForm((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <Tile label="Total" value={s.total} />
          <Tile label="Overdue" value={s.overdue} danger />
          <Tile label="Due soon" value={s.due_soon} warn />
          <Tile label="Upcoming" value={s.upcoming} />
          <Tile label="Filed" value={s.filed} ok />
        </div>

        {showForm && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Type"><select value={form.compliance_type} onChange={(e) => setForm({ ...form, compliance_type: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm">{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></Field>
            <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm w-full" /></Field>
            <Field label="Due date"><input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm w-full" /></Field>
            <Field label="Amount (cents)"><input type="number" value={form.amount_cents} onChange={(e) => setForm({ ...form, amount_cents: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm w-full" /></Field>
            <Field label="Recurrence"><select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm">{['one_off','monthly','quarterly','yearly'].map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
            <Field label="Reminder days"><input type="number" value={form.reminder_days} onChange={(e) => setForm({ ...form, reminder_days: Number(e.target.value) })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm w-full" /></Field>
            <div className="col-span-2 md:col-span-4 flex justify-end"><button onClick={create} className="text-sm px-4 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">Create</button></div>
          </div>
        )}

        {loading ? <Spinner /> : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80"><tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                <th className="px-3 py-2 font-medium">Title</th><th className="font-medium">Type</th><th className="font-medium">Due</th><th className="font-medium">Status</th><th className="font-medium">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-800/60">
                {items.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-600">No compliance items.</td></tr> :
                  items.map((c) => <tr key={c.id}>
                    <td className="px-3 py-2 text-zinc-200">{c.title}</td>
                    <td className="text-zinc-500">{c.type_label}</td>
                    <td className="text-zinc-400">{c.due_date}</td>
                    <td><span className={`text-xs px-2 py-0.5 rounded ${STAT_STYLE[c.status] || 'text-zinc-400 bg-zinc-800'}`}>{c.status}</span></td>
                    <td className="space-x-1">
                      <button onClick={() => setStatus(c, 'filed')} className="text-xs px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-400">File</button>
                      <button onClick={() => setStatus(c, 'paid')} className="text-xs px-2 py-0.5 rounded border border-zinc-700 text-zinc-400">Pay</button>
                      <button onClick={() => setStatus(c, 'waived')} className="text-xs px-2 py-0.5 rounded border border-zinc-700 text-zinc-500">Waive</button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, danger, warn, ok }) {
  const c = danger ? 'text-rose-400' : warn ? 'text-amber-400' : ok ? 'text-emerald-400' : 'text-zinc-100';
  return <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4"><p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p><p className={`text-2xl font-bold tabular-nums ${c}`}>{value}</p></div>;
}
function Field({ label, children }) { return <div><label className="text-xs text-zinc-500 block mb-1">{label}</label>{children}</div>; }
function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }