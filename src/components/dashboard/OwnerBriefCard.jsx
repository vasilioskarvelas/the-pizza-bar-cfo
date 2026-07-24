import React, { useState } from 'react';
import { Sun, TrendingUp, AlertTriangle, CheckCircle2, ListChecks, Coins, ShieldCheck } from 'lucide-react';
import { fmtValue, scoreColor, CONF_STYLE } from '@/lib/dashboardFormat';

export default function OwnerBriefCard({ brief, loading, onRegenerate }) {
  const [open, setOpen] = useState(true);
  if (!brief) return null;
  const o = brief.overall || {};
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sun className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Daily Owner Brief</h3>
        <span className="text-[10px] text-zinc-600 ml-1">{brief.as_of}</span>
        <button onClick={onRegenerate} disabled={loading} className="ml-auto text-[11px] text-zinc-400 hover:text-amber-300 disabled:opacity-50">Regenerate</button>
        <button onClick={() => setOpen(!open)} className="text-zinc-500 text-xs">{open ? "−" : "+"}</button>
      </div>
      {open && (
        <div className="space-y-3 text-sm">
          <p className="text-zinc-300">{brief.greeting} Overall business health is <span className={`font-semibold ${scoreColor(o.score)}`}>{o.status || "—"}</span> (Owner Score {o.score != null ? Number(o.score).toFixed(0) : "—"}).</p>
          {brief.wins?.length > 0 && <Block icon={TrendingUp} title="Wins" items={brief.wins} color="text-emerald-400" />}
          {brief.watch?.length > 0 && <Block icon={AlertTriangle} title="Watch" items={brief.watch} color="text-amber-400" />}
          {brief.today?.length > 0 && <Block icon={ListChecks} title="Today" items={brief.today} color="text-sky-400" />}
          {brief.actions?.length > 0 && <Block icon={CheckCircle2} title="Recommended Actions" items={brief.actions} color="text-amber-400" />}
          {brief.financial_snapshot?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 mb-1"><Coins className="w-3.5 h-3.5 text-zinc-500" /> Financial Snapshot</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {brief.financial_snapshot.map((f) => (
                  <div key={f.code} className="text-xs px-2 py-1 rounded bg-zinc-800/40">
                    <span className="text-zinc-500">{f.label}: </span>
                    <span className="text-zinc-200 font-mono">{fmtValue(f.value, f.unit)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {brief.upcoming_obligations?.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs"><ShieldCheck className="w-3.5 h-3.5 text-zinc-500" /><span className="text-zinc-500">Upcoming:</span> {brief.upcoming_obligations.map((o) => o.item).join(", ")}</div>
          )}
          <p className="text-[10px] text-zinc-600">Generated from deterministic Phase 05/06 outputs — no AI. Recommendations are rule-based.</p>
        </div>
      )}
    </div>
  );
}

function Block({ icon: Icon, title, items, color }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${color} mb-1`}><Icon className="w-3.5 h-3.5" /> {title}</div>
      <ul className="space-y-0.5 text-xs text-zinc-400 ml-5 list-disc">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}