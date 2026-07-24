import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Save } from 'lucide-react';

const RULES = [
  { key: "alert_critical", label: "Critical alerts → in-app + flag", default: true },
  { key: "alert_high", label: "High alerts → in-app notification", default: true },
  { key: "alert_medium", label: "Medium alerts → in-app notification", default: true },
  { key: "alert_low", label: "Low alerts → in-app notification", default: false },
  { key: "connector_failure", label: "Connector failure → notification", default: true },
  { key: "calculation_failure", label: "Calculation failure → notification", default: true },
  { key: "owner_score_change", label: "Owner Score change (≥2 pts) → notification", default: true },
  { key: "tax_deadline", label: "Tax deadline approaching → reminder", default: true },
  { key: "commitment_due", label: "Upcoming commitment → reminder", default: true },
];

export default function NotificationRules() {
  const [rules, setRules] = useState(() => { try { return { ...Object.fromEntries(RULES.map((r) => [r.key, r.default])), ...JSON.parse(localStorage.getItem("notification_rules") || "{}") }; } catch { return Object.fromEntries(RULES.map((r) => [r.key, r.default])); } });
  const save = () => { localStorage.setItem("notification_rules", JSON.stringify(rules)); alert("Notification rules saved."); };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Bell className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Notification Rules</h1></div>
      <p className="text-sm text-zinc-500">Controls which deterministic events generate in-app notifications. The alert engine creates Notification records when these conditions fire.</p>
      <Card><CardHeader><CardTitle className="text-base">Routing Rules</CardTitle></CardHeader><CardContent>
        <div className="divide-y divide-zinc-800/60">
          {RULES.map((r) => (
            <div key={r.key} className="flex items-center gap-3 p-3">
              <span className="text-sm text-zinc-200">{r.label}</span>
              <input type="checkbox" checked={!!rules[r.key]} onChange={(e) => setRules({ ...rules, [r.key]: e.target.checked })} className="ml-auto w-4 h-4 accent-amber-500" />
            </div>
          ))}
        </div>
        <button onClick={save} className="mt-4 flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20"><Save className="w-4 h-4" /> Save</button>
      </CardContent></Card>
    </div>
  );
}