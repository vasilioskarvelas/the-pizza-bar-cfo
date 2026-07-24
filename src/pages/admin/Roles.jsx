import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { PERMISSION_LABELS } from '@/lib/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState({});
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [r, p, rp] = await Promise.all([
      base44.entities.Role.list(),
      base44.entities.Permission.list(),
      base44.entities.RolePermission.list(),
    ]);
    setRoles(r || []);
    setPerms(Object.fromEntries((p || []).map((x) => [x.id, x])));
    const m = {};
    for (const x of rp || []) (m[x.role_id] = m[x.role_id] || new Set()).add(x.permission_id);
    setMatrix(m);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Roles</h1>
          <p className="text-sm text-zinc-500">Seeded role definitions and their granted permissions. Grants are deny-by-default.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>
      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : (
        <div className="space-y-3">
          {roles.map((role) => {
            const granted = matrix[role.id] || new Set();
            return (
              <Card key={role.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{role.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">{role.scope}</Badge>
                  </div>
                  {role.description && <p className="text-xs text-zinc-500">{role.description}</p>}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(perms).map((p) => (
                      <span key={p.id} className={`text-xs px-1.5 py-0.5 rounded border ${granted.has(p.id) ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-zinc-800/40 text-zinc-600 border-zinc-700/40'}`}>
                        {p.code}
                      </span>
                    ))}
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