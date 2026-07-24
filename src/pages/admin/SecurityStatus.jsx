import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { PRIVILEGED_ROLES, ROLE_LABELS } from '@/lib/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ShieldCheck, ShieldAlert, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SecurityStatus() {
  const [events, setEvents] = useState([]);
  const [audit, setAudit] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [ev, au, p] = await Promise.all([
        base44.entities.SystemEvent.filter({}).then((r) => (r || []).filter((e) => (e.event_key || '').startsWith('auth.'))).then((r) => r.slice(0, 20)),
        base44.entities.AuditLog.list('-created_date', 20).catch(() => []),
        base44.entities.UserProfile.list(),
      ]);
      setEvents(ev);
      setAudit(au || []);
      setProfiles(p || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const privileged = profiles.filter((p) => PRIVILEGED_ROLES.includes(p.system_role));
  const mfaCovered = privileged.filter((p) => p.mfa_enrolled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Security Status</h1>
          <p className="text-sm text-zinc-500">MFA readiness, recent security events, and the audit trail.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-2"><KeyRound className="w-3.5 h-3.5" />MFA coverage (privileged)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{mfaCovered}/{privileged.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Privileged roles: {PRIVILEGED_ROLES.map((r) => ROLE_LABELS[r]).join(', ')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" />Security events (recent)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{events.length}</p><p className="text-xs text-zinc-500 mt-1">auth.* namespaced events</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-2"><ShieldAlert className="w-3.5 h-3.5" />Audit records (recent)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{audit.length}</p><p className="text-xs text-zinc-500 mt-1">admin-only, append-only</p></CardContent>
        </Card>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-4 text-xs text-amber-200/90 leading-relaxed">
          <strong className="text-amber-300">MFA enforcement limitation.</strong> Base44 provides per-user self-serve 2FA (authenticator app / SMS) and IdP-level MFA via SSO on Enterprise workspaces, but <strong>no application-layer toggle to force MFA</strong> for members. This screen therefore displays MFA <em>status</em> only; it cannot enforce enrolment. Enforce MFA centrally via your identity provider (SSO) or require 2FA as part of your onboarding policy. The privileged-role enforcement hook records the policy intent but cannot technically block an unenrolled privileged user at the application layer.
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent security events</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : events.length === 0 ? <p className="text-sm text-zinc-600">No auth.* events.</p> : (
            <div className="divide-y divide-zinc-800/60">
              {events.map((e) => (
                <div key={e.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-mono text-amber-300 truncate">{e.event_key}</p>
                    <p className="text-xs text-zinc-500 truncate">{e.message}</p>
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0">{new Date(e.occurred_at || e.created_date).toLocaleString('en-AU')}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent audit log</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : audit.length === 0 ? <p className="text-sm text-zinc-600">No audit records.</p> : (
            <div className="divide-y divide-zinc-800/60">
              {audit.map((a) => (
                <div key={a.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-mono text-zinc-200 truncate">{a.action_type} · {a.entity_type}</p>
                    <p className="text-xs text-zinc-500 truncate">{a.reason || a.after_state || ''}</p>
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0">{new Date(a.created_date).toLocaleString('en-AU')}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}