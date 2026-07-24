import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Check, X, Archive } from 'lucide-react';
import { SEV_STYLE, timeAgo } from '@/lib/dashboardFormat';

const TABS = ["unread", "read", "dismissed", "archived"];

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("unread");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setItems(await base44.entities.Notification.list() || []); } catch { setItems([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const act = async (id, action) => { await base44.functions.invoke("dismissNotification", { notification_id: id, action }); load(); };
  const filtered = items.filter((n) => n.status === tab);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Bell className="w-5 h-5 text-amber-400" />
          <h1 className="text-xl font-bold">Notifications</h1>
          <a href="/" className="ml-auto text-xs text-zinc-400 hover:text-amber-300">← Dashboard</a>
        </div>
        <div className="flex gap-1 mb-4">
          {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-xs capitalize ${tab === t ? "bg-amber-500/10 text-amber-300 border border-amber-500/20" : "border border-zinc-800 text-zinc-400"}`}>{t}</button>)}
        </div>
        <Card><CardContent className="p-0">
          {loading ? <p className="text-sm text-zinc-500 p-6">Loading…</p> : filtered.length === 0 ? <p className="text-sm text-zinc-600 p-6">No {tab} notifications.</p> : (
            <div className="divide-y divide-zinc-800/60">
              {filtered.map((n) => { const s = SEV_STYLE[n.severity === "critical" ? "critical" : n.severity === "warning" ? "high" : "low"] || SEV_STYLE.low; return (
                <div key={n.id} className="p-3 flex items-start gap-3">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${s.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 font-medium">{n.title}</p>
                    <p className="text-xs text-zinc-500">{n.body}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">{n.notification_type} · {timeAgo(n.created_date)}</p>
                  </div>
                  {tab === "unread" && <button onClick={() => act(n.id, "read")} className="text-zinc-400 hover:text-emerald-400" title="Mark read"><Check className="w-4 h-4" /></button>}
                  <button onClick={() => act(n.id, "dismiss")} className="text-zinc-400 hover:text-rose-400" title="Dismiss"><X className="w-4 h-4" /></button>
                  <button onClick={() => act(n.id, "archive")} className="text-zinc-400 hover:text-zinc-200" title="Archive"><Archive className="w-4 h-4" /></button>
                </div>
              );})}
            </div>
          )}
        </CardContent></Card>
        <p className="text-[11px] text-zinc-600 mt-3">Notifications originate from alerts, connector/calculation failures, owner-score changes and tax deadlines — generated deterministically by the Phase 07 alert engine.</p>
      </div>
    </div>
  );
}