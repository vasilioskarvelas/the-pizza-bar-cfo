import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { CalendarClock, Save, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DAYS = [
  { v: 1, label: "Monday" }, { v: 2, label: "Tuesday" }, { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" }, { v: 5, label: "Friday" }, { v: 6, label: "Saturday" }, { v: 0, label: "Sunday" },
];

export default function WeeklyReportConfig() {
  const [rec, setRec] = useState(null);
  const [form, setForm] = useState({ delivery_day_of_week: 1, delivery_hour: 8, send_email: false, use_current_week: false, enabled: true, recipient_user_id: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const list = await base44.entities.WeeklyReportSetting.list();
      const org = list.find((r) => !r.site_id) || list[0] || null;
      setRec(org);
      if (org) setForm({
        delivery_day_of_week: org.delivery_day_of_week ?? 1, delivery_hour: org.delivery_hour ?? 8,
        send_email: !!org.send_email, use_current_week: !!org.use_current_week,
        enabled: org.enabled !== false, recipient_user_id: org.recipient_user_id || "",
      });
    } catch (e) { console.error(e); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const payload = { ...form, recipient_user_id: form.recipient_user_id || null, organisation_id: rec?.organisation_id || undefined };
      if (rec) await base44.entities.WeeklyReportSetting.update(rec.id, payload);
      else await base44.entities.WeeklyReportSetting.create({ ...payload, site_id: null });
      setMsg({ ok: true, text: "Saved." });
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message || "Save failed" }); }
    setSaving(false);
  };

  const remove = async () => {
    if (!rec) return;
    if (!confirm("Delete this weekly report configuration?")) return;
    try { await base44.entities.WeeklyReportSetting.delete(rec.id); setRec(null); setForm({ delivery_day_of_week: 1, delivery_hour: 8, send_email: false, use_current_week: false, enabled: true, recipient_user_id: "" }); setMsg({ ok: true, text: "Deleted." }); } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="w-5 h-5 text-amber-500" />
        <h1 className="text-lg font-bold">Weekly Report Configuration</h1>
      </div>
      <p className="text-xs text-zinc-500 mb-6">Delivery schedule + email recipient for the deterministic weekly report. The scheduled workflow fires Monday 08:00 Melbourne regardless of these settings; this controls email delivery + which week is reported.</p>

      <div className="max-w-xl space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-zinc-500">Delivery day</Label>
            <select value={form.delivery_day_of_week} onChange={(e) => setForm({ ...form, delivery_day_of_week: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
              {DAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-zinc-500">Delivery hour (0-23)</Label>
            <Input type="number" min={0} max={23} value={form.delivery_hour} onChange={(e) => setForm({ ...form, delivery_hour: Number(e.target.value) || 0 })} className="mt-1 bg-zinc-950" />
          </div>
        </div>

        <div>
          <Label className="text-xs text-zinc-500">Recipient user ID (optional — defaults to first admin)</Label>
          <Input value={form.recipient_user_id} onChange={(e) => setForm({ ...form, recipient_user_id: e.target.value })} placeholder="leave blank for first admin" className="mt-1 bg-zinc-950" />
        </div>

        <div className="space-y-3 pt-2">
          <Row label="Email delivery enabled" desc="Send the weekly report to the registered recipient."><Switch checked={form.send_email} onCheckedChange={(v) => setForm({ ...form, send_email: v })} /></Row>
          <Row label="Report current week" desc="Default reports the most recently completed week."><Switch checked={form.use_current_week} onCheckedChange={(v) => setForm({ ...form, use_current_week: v })} /></Row>
          <Row label="Enabled" desc="Master switch for this configuration."><Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /></Row>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}</button>
          {rec && <button onClick={remove} className="text-sm px-3 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-rose-400 flex items-center gap-1"><Trash2 className="w-4 h-4" /> Delete</button>}
          {msg && <span className={`text-xs ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</span>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-t border-zinc-800/60">
      <div><p className="text-sm text-zinc-200">{label}</p><p className="text-xs text-zinc-600">{desc}</p></div>
      {children}
    </div>
  );
}