import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ROLE_LABELS } from '@/lib/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { UserPlus, RefreshCw, ShieldOff, RotateCcw, CheckCircle2 } from 'lucide-react';

const ACTIVE = (r) => !r.effective_to || r.effective_to >= new Date().toISOString().slice(0, 10);

export default function Users() {
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [access, setAccess] = useState({});
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({ email: '', systemRole: 'site_manager', siteIds: [] });

  async function load() {
    setLoading(true);
    const [u, p, sa, s] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.UserProfile.list(),
      base44.entities.UserSiteAccess.list(),
      base44.entities.Site.list(),
    ]);
    setUsers(u || []);
    setProfiles(Object.fromEntries((p || []).map((x) => [x.user_id, x])));
    const g = {};
    for (const r of sa || []) (g[r.user_id] = g[r.user_id] || []).push(r);
    setAccess(g);
    setSites(s || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function call(payload) {
    setBusy(true);
    try { await base44.functions.invoke('manageAccess', payload); await load(); }
    catch (e) { console.error(e); }
    setBusy(false);
  }

  const siteName = (id) => sites.find((s) => s.id === id)?.name || id.slice(-6);

  function toggleInviteSite(id) {
    setInvite((p) => ({ ...p, siteIds: p.siteIds.includes(id) ? p.siteIds.filter((x) => x !== id) : [...p.siteIds, id] }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Users</h1>
        <p className="text-sm text-zinc-500">Invite, provision, and manage access. Invitation sends a platform invite; access is provisioned after the user registers.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserPlus className="w-4 h-4" /> Invite user</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="email@example.com" value={invite.email} onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value }))} />
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-zinc-500 mr-1">Role:</span>
            {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'system').map(([k, label]) => (
              <button key={k} onClick={() => setInvite((p) => ({ ...p, systemRole: k }))}
                className={`text-xs px-2 py-1 rounded border ${invite.systemRole === k ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'text-zinc-400 border-zinc-700'}`}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-zinc-500 mr-1">Sites:</span>
            {sites.map((s) => (
              <button key={s.id} onClick={() => toggleInviteSite(s.id)}
                className={`text-xs px-2 py-1 rounded border ${invite.siteIds.includes(s.id) ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'text-zinc-400 border-zinc-700'}`}>{s.name}</button>
            ))}
          </div>
          <Button disabled={busy || !invite.email} onClick={() => call({ action: 'invite', email: invite.email, systemRole: invite.systemRole, siteIds: invite.siteIds }).then(() => setInvite({ email: '', systemRole: 'site_manager', siteIds: [] }))}>
            Send invite
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Registered users</CardTitle>
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : (
            <div className="space-y-2">
              {users.map((u) => {
                const prof = profiles[u.id];
                const siteRows = (access[u.id] || []).filter(ACTIVE);
                const isSelf = u.id === users._self;
                return (
                  <div key={u.id} className="rounded-lg border border-zinc-800 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                        <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {prof ? <Badge variant="outline" className="text-xs">{ROLE_LABELS[prof.system_role] || prof.system_role}</Badge> : <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">unprovisioned</Badge>}
                        {prof?.status === 'suspended' && <Badge variant="outline" className="text-xs text-rose-400 border-rose-500/30">suspended</Badge>}
                        {prof?.mfa_enrolled && <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />MFA</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {siteRows.length ? siteRows.map((r) => (
                        <span key={r.id} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{siteName(r.site_id)}</span>
                      )) : <span className="text-xs text-zinc-600">no site access</span>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {!prof && <Button size="sm" variant="outline" disabled={busy} onClick={() => call({ action: 'provision', userId: u.id, email: u.email, systemRole: 'site_manager', siteIds: sites.map((s) => s.id) })}>Provision</Button>}
                      {prof && <Button size="sm" variant="outline" disabled={busy} onClick={() => call({ action: 'changeRole', userId: u.id, systemRole: 'site_manager' })}>Set Site Manager</Button>}
                      {prof && <Button size="sm" variant="outline" disabled={busy} onClick={() => call({ action: 'changeSites', userId: u.id, siteIds: sites.map((s) => s.id) })}>All sites</Button>}
                      {prof?.status !== 'suspended'
                        ? <Button size="sm" variant="outline" className="text-rose-300" disabled={busy} onClick={() => call({ action: 'disable', userId: u.id })}><ShieldOff className="w-3 h-3 mr-1" />Disable</Button>
                        : <Button size="sm" variant="outline" className="text-emerald-300" disabled={busy} onClick={() => call({ action: 'restore', userId: u.id })}><RotateCcw className="w-3 h-3 mr-1" />Restore</Button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}