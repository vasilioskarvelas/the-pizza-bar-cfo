import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sun, ListChecks, TrendingUp, AlertTriangle, CheckCircle2, Coins, ShieldCheck } from 'lucide-react';

const SECTIONS = [
  { key: "greeting", icon: Sun, title: "Greeting + Overall Business Health", from: "Owner Score result + components (Phase 06)" },
  { key: "yesterday", icon: ListChecks, title: "Yesterday", from: "Activity timeline (SystemEvent/AuditLog) for prior day" },
  { key: "today", icon: ListChecks, title: "Today", from: "Connector failures + reconciliation exceptions" },
  { key: "watch", icon: AlertTriangle, title: "Watch", from: "Active alerts (alert engine)" },
  { key: "wins", icon: TrendingUp, title: "Wins", from: "KPI cards with positive period-over-period trend" },
  { key: "actions", icon: CheckCircle2, title: "Recommended Actions", from: "Rule-based: GST, labour, food cost, runway, reconciliation" },
  { key: "snapshot", icon: Coins, title: "Financial Snapshot", from: "Financial figure results (Phase 05)" },
  { key: "obligations", icon: ShieldCheck, title: "Upcoming Obligations", from: "GST position + net profit tax provision (deterministic)" },
];

export default function OwnerBriefRules() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Sun className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Owner Brief Rules</h1></div>
      <p className="text-sm text-zinc-500">The Daily Owner Brief is generated deterministically from Phase 05/06 outputs — no AI. Each section below is fixed and rule-based.</p>
      <Card><CardHeader><CardTitle className="text-base">Brief Sections</CardTitle></CardHeader><CardContent>
        <div className="divide-y divide-zinc-800/60">
          {SECTIONS.map((s) => { const Icon = s.icon; return (
            <div key={s.key} className="flex items-start gap-3 p-3">
              <Icon className="w-4 h-4 text-zinc-400 mt-0.5" />
              <div><p className="text-sm text-zinc-200 font-medium">{s.title}</p><p className="text-xs text-zinc-500">{s.from}</p></div>
              <span className="ml-auto text-[10px] text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 rounded">rule-based</span>
            </div>
          );})}
        </div>
      </CardContent></Card>
      <p className="text-xs text-zinc-600">Action rules: GST due when net GST &gt; 0; labour above 35%; food cost above 32%; cash runway below 4 weeks; reconciliation exceptions pending.</p>
    </div>
  );
}