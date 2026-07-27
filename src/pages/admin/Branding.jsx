import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Palette, Save } from 'lucide-react';

export default function AdminBranding() {
  const [b, setB] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recId, setRecId] = useState(null);

  const load = async (id) => {
    try {
      const res = await base44.functions.invoke('getBrandingSettings', { organisation_id: id || orgId });
      setB(res.branding); setRecId(res.branding.id || null);
    } catch (e) { console.error(e); }
  };
  useEffect(() => { base44.auth.me().then((u) => { const id = u?.data?.organisation_id || u?.organisation_id || null; setOrgId(id); if (id) load(id); }).catch(() => {}); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { organisation_id: orgId, logo_url: b.logo_url, primary_color: b.primary_color, accent_color: b.accent_color, report_header: b.report_header, email_footer: b.email_footer, login_bg_url: b.login_bg_url, enabled: b.enabled };
      if (recId) await base44.entities.BrandingSetting.update(recId, payload);
      else { const created = await base44.entities.BrandingSetting.create(payload); setRecId(created.id); }
      await load(orgId);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  if (!b) return <p className="text-sm text-zinc-500">Loading branding…</p>;
  const upd = (patch) => setB({ ...b, ...patch });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Palette className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">White Labelling</h1>
        <button onClick={save} disabled={saving} className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1 disabled:opacity-50"><Save className="w-3 h-3" /> Save</button></div>
      <p className="text-sm text-zinc-500">Organisation branding applied to reports, emails and the login screen.</p>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Logo URL"><input value={b.logo_url || ''} onChange={(e) => upd({ logo_url: e.target.value })} className="inp" /></Field>
        <Field label="Login background URL"><input value={b.login_bg_url || ''} onChange={(e) => upd({ login_bg_url: e.target.value })} className="inp" /></Field>
        <Field label="Primary colour"><div className="flex items-center gap-2"><input type="color" value={b.primary_color || '#0f172a'} onChange={(e) => upd({ primary_color: e.target.value })} className="w-10 h-9 rounded border border-zinc-800 bg-zinc-900" /><input value={b.primary_color || ''} onChange={(e) => upd({ primary_color: e.target.value })} className="inp" /></div></Field>
        <Field label="Accent colour"><div className="flex items-center gap-2"><input type="color" value={b.accent_color || '#f59e0b'} onChange={(e) => upd({ accent_color: e.target.value })} className="w-10 h-9 rounded border border-zinc-800 bg-zinc-900" /><input value={b.accent_color || ''} onChange={(e) => upd({ accent_color: e.target.value })} className="inp" /></div></Field>
        <Field label="Report header"><input value={b.report_header || ''} onChange={(e) => upd({ report_header: e.target.value })} className="inp" /></Field>
        <Field label="Email footer"><input value={b.email_footer || ''} onChange={(e) => upd({ email_footer: e.target.value })} className="inp" /></Field>
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={!!b.enabled} onChange={(e) => upd({ enabled: e.target.checked })} /> Enabled</label>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">Preview</h3>
        <div className="rounded-lg p-6" style={{ background: b.login_bg_url ? `url(${b.login_bg_url}) center/cover` : b.primary_color, color: '#fff' }}>
          {b.logo_url && <img src={b.logo_url} alt="logo" className="h-10 mb-3 object-contain" />}
          <h2 className="text-lg font-bold" style={{ color: b.accent_color }}>{b.report_header || 'Report Header'}</h2>
          <p className="text-sm opacity-80">{b.email_footer || 'Email footer text'}</p>
        </div>
      </div>
      <style>{`.inp{background:#09090b;border:1px solid #27272a;border-radius:0.375rem;padding:0.375rem 0.5rem;font-size:0.875rem;width:100%}`}</style>
    </div>
  );
}
function Field({ label, children }) { return <div><label className="text-xs text-zinc-500 block mb-1">{label}</label>{children}</div>; }