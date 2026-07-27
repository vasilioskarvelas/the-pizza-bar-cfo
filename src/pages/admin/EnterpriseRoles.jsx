import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { KeyRound, Plus, Trash2, GitBranch } from 'lucide-react';
import { ENTERPRISE_ROLES } from '@/lib/enterpriseRoles';

export default function AdminEnterpriseRoles() {
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [rolePerms, setRolePerms] = useState([]);
  const [orgId, setOrgId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', scope: 'organisation', parent_role_id: '' });

  const load = async () => {
    try {
      const [r, p, rp] = await Promise.all([
        base44.entities.Role.list(), base44.entities.Permission.list(), base44.entities.RolePermission.list(),
      ]);
      setRoles(r || []); setPerms(p || []); setRolePerms(rp || []);
    } catch (e) { console.error(e); }
  };
  useEffect(() => { base44.auth.me().then((u) => setOrgId(u?.data?.organisation_id || u?.organisation_id || null)).catch(() => {}); load(); }, []);

  const seed = async () => {
    if (!orgId) return;
    for (const r of ENTERPRISE_ROLES) {
      try { await base44.entities.Role.create({ organisation_id: orgId, role_key: r.role_key, name: r.name, scope: r.scope, is_system: r.is_system, level: r.level, status: 'active' }); } catch {}
    }
    load();
  };
  const create = async () => {
    if (!form.name || !orgId) return;
    try { await base44.entities.Role.create({ organisation_id: orgId, role_key: form.name.toLowerCase().replace(/\s+/g, '_'), name: form.name, description: form.description, scope: form.scope, parent_role_id: form.parent_role_id || null, is_system: false, level: 0, status: 'active' }); setForm({ name: '', description: '', scope: 'organisation', parent_role_id: '' }); setShowForm(false); load(); }
    catch (e) { alert(e.message); }
  };
  const del = async (r) => { if (r.is_system) return alert('System roles cannot be deleted.'); await base44.entities.Role.delete(r.id); load(); };

  const permCount = (roleId) => rolePerms.filter((rp) => rp.role_id === roleId).length;
  const inheritedRoles = roles.filter((r) => r.parent_role_id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Enterprise Roles</h1>
        <button onClick={seed} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Seed enterprise roles</button>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1"><Plus className="w-3 h-3" /> Custom role</button></div>
      <p className="text-sm text-zinc-500">Platform Owner → Enterprise Admin → Org Owner → Regional/Site Manager → Accountant/Controller → Advisor/Auditor → Read Only. Custom roles inherit permissions via a parent role.</p>

      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <F label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="inp" /></F>
          <F label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="inp" /></F>
          <F label="Scope"><select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} className="inp">{['platform','organisation','site'].map((s) => <option key={s} value={s}>{s}</option>)}</select></F>
          <F label="Inherits from"><select value={form.parent_role_id} onChange={(e) => setForm({ ...form, parent_role_id: e.target.value })} className="inp"><option value="">none</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></F>
          <div className="col-span-4"><button onClick={create} className="text-sm px-4 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">Create role</button></div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80"><tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
            <th className="px-3 py-2 font-medium">Role</th><th className="font-medium">Key</th><th className="font-medium">Scope</th><th className="font-medium">Level</th><th className="font-medium">Inherits</th><th className="text-right font-medium">Permissions</th><th className="font-medium w-12">Del</th>
          </tr></thead>
          <tbody className="divide-y divide-zinc-800/60">
            {roles.map((r) => <tr key={r.id} className="hover:bg-zinc-800/30">
              <td className="px-3 py-2 text-zinc-200 font-medium">{r.name} {r.is_system && <span className="text-[10px] text-amber-400 ml-1">system</span>}</td>
              <td className="text-zinc-500 font-mono text-xs">{r.role_key || '—'}</td>
              <td className="text-zinc-500">{r.scope}</td>
              <td className="text-zinc-400 tabular-nums">{r.level ?? 0}</td>
              <td className="text-zinc-500">{r.parent_role_id ? <span className="inline-flex items-center gap-1 text-sky-400"><GitBranch className="w-3 h-3" />{roles.find((x) => x.id === r.parent_role_id)?.name || 'parent'}</span> : '—'}</td>
              <td className="text-right tabular-nums text-zinc-300">{permCount(r.id)}</td>
              <td><button onClick={() => del(r)} className="text-zinc-500 hover:text-rose-400 disabled:opacity-30" disabled={r.is_system}><Trash2 className="w-4 h-4" /></button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-600">{inheritedRoles.length} role(s) use permission inheritance via parent_role_id — resolved at runtime by the enterprise engine (walks the chain, union of permission codes).</p>
      <style>{`.inp{background:#09090b;border:1px solid #27272a;border-radius:0.375rem;padding:0.375rem 0.5rem;font-size:0.875rem;width:100%}`}</style>
    </div>
  );
}
function F({ label, children }) { return <div><label className="text-xs text-zinc-500 block mb-1">{label}</label>{children}</div>; }