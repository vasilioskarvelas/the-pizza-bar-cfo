import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Permissions() {
  const [perms, setPerms] = useState([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const p = await base44.entities.Permission.list();
    setPerms(p || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Permissions</h1>
          <p className="text-sm text-zinc-500">The permission registry. All checks are deny-by-default.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>
      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : (
        <Card>
          <CardContent className="pt-4">
            <div className="divide-y divide-zinc-800/60">
              {perms.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-mono text-zinc-200">{p.code}</p>
                    {p.description && <p className="text-xs text-zinc-500">{p.description}</p>}
                  </div>
                  <Badge variant="outline" className="text-xs">{p.scope}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}