import React from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/financials';

const SEVERITY_STYLES = {
  critical: { dot: 'bg-rose-500', text: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/5' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5' },
  info: { dot: 'bg-sky-500', text: 'text-sky-400', border: 'border-sky-500/20', bg: 'bg-sky-500/5' },
};

export default function AnomalyPanel({ anomalies }) {
  const open = (anomalies || []).filter((a) => a.status === 'open').slice(0, 4);

  return (
    <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-zinc-300">Anomalies Requiring Attention</h3>
      </div>
      {open.length === 0 ? (
        <p className="text-sm text-zinc-600 py-4 text-center">No open anomalies</p>
      ) : (
        <div className="space-y-3">
          {open.map((a) => {
            const style = SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.warning;
            return (
              <div key={a.id} className={`rounded-lg ${style.bg} ${style.border} border p-3`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200">{a.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{a.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {a.site_name && <span className="text-xs text-zinc-600">{a.site_name}</span>}
                      {a.impact_amount > 0 && (
                        <span className={`text-xs font-medium ${style.text} tabular-nums`}>{formatCurrency(a.impact_amount)} impact</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}