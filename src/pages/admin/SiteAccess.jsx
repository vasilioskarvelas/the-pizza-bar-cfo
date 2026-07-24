import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, RotateCw } from 'lucide-react';

const ACTIVE = (r) => !r.effective_to || r.effective_to >= new Date().toISOString().slice(0, 10);

export default function SiteAccess() {
  const [users, setUsers] = useState([]);
  const [access, setAccess] = useState({});
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    const [u, sa, s] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.UserSiteAccess.list(),
      base44.entities.Site.list(),
    ]);
    setUsers(u || []);
    setSites(s || []);
    const g = {};
    for (const r of sa || []) (g[r.user_id] = g[r.user_id] || []).push(r);
    setAccess(g);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function resync(userId) {
    setBusyId(userId);
    try { await base44.functions.invoke('syncSiteCache', { user_id: userId }); await load(); }
    catch (e) { console.error(e); }
    setBusyId(null);
  }

  const siteName = (id) => sites.find((s) => s.id === id)?.name || id.slice(-6);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Site Access</h1>
          <p className="text-sm text-zinc-500"><span className="font-mono text-xs">UserSiteAccess</span> is the canonical record. <span className="font-mono text-xs">User.site_ids[]</span> is only a synchronised RLS cache, rebuilt by the canonical sync service.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>
      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : (
        <div className="space-y-3">
          {users.map((u) => {
            const rows = (access[u.id] || []);
            const active = rows.filter(ACTIVE);
            return (
              <Card key={u.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">{u.full_name || u.email}</CardTitle>
                    <p className="text-xs text-zinc-500">{u.email}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={busyId === u.id} onClick={() => resync(u.id)}>
                    <RotateCw className={`w-3 h-3 mr-1 ${busyId === u.id ? 'animate-spin' : ''}`} /> Rebuild cache
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {active.length ? active.map((r) => (
                      <Badge key={r.id} variant="outline" className="text-xs">{siteName(r.site_id)}{r.site_role ? ` · ${r.site_role}` : ''}</Badge>
                    )) : <span className="text-xs text-zinc-600">no active site access</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}