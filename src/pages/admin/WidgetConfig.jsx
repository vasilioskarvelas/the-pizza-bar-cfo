import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Eye, EyeOff, Star } from 'lucide-react';

const WIDGETS = ["hero", "kpi", "health", "alerts", "brief", "trend", "recon", "connectors", "timeline"];

export default function WidgetConfig() {
  const [widgets, setWidgets] = useState([]);
  const load = async () => { try { const r = await base44.functions.invoke("getDashboardWidgets", {}); setWidgets(r.widgets || []); } catch {} };
  useEffect(() => { load(); }, []);
  const save = (widget_key, patch) => base44.functions.invoke("getDashboardWidgets", { action: "save", widgets: [{ widget_key, ...patch }] }).then(load);
  const get = (k) => widgets.find((w) => w.widget_key === k) || { widget_key: k, visible: true, collapsed: false, favourite: false, sort_order: 0 };
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Widget Configuration</h1><p className="text-sm text-zinc-500">Per-user widget visibility, favourites and order. Persists to DashboardWidget.</p></div>
      <Card><CardContent className="p-0">
        <div className="divide-y divide-zinc-800/60">
          {WIDGETS.map((k, i) => { const w = get(k); return (
            <div key={k} className="flex items-center gap-3 p-3">
              <span className="text-zinc-600 text-xs font-mono w-6">{i + 1}</span>
              <span className="text-sm text-zinc-200 capitalize">{k}</span>
              <button onClick={() => save(k, { visible: !w.visible, collapsed: w.collapsed, favourite: w.favourite, sort_order: i })} className="ml-auto text-zinc-400 hover:text-amber-300">{w.visible !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
              <button onClick={() => save(k, { visible: w.visible !== false, collapsed: w.collapsed, favourite: !w.favourite, sort_order: i })} className={w.favourite ? "text-amber-400" : "text-zinc-600"}><Star className="w-4 h-4" fill={w.favourite ? "currentColor" : "none"} /></button>
            </div>
          );})}
        </div>
      </CardContent></Card>
    </div>
  );
}