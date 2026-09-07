import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatAUD } from '@/lib/autopilotEngine';

const CONF = { high: 'High', medium: 'Medium', low: 'Low' };

const STYLES = {
  red: { border: 'border-rose-200', bg: 'bg-rose-50', icon: 'text-rose-600', chip: 'bg-rose-100 text-rose-700' },
  orange: { border: 'border-amber-200', bg: 'bg-amber-50', icon: 'text-amber-600', chip: 'bg-amber-100 text-amber-700' },
  green: { border: 'border-emerald-200', bg: 'bg-emerald-50', icon: 'text-emerald-600', chip: 'bg-emerald-100 text-emerald-700' },
};

export default function AttentionCard({ item, onAction }) {
  const s = STYLES[item.severity] || STYLES.orange;
  const Icon = item.severity === 'red' ? AlertOctagon : item.severity === 'orange' ? AlertTriangle : CheckCircle2;
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${s.icon} mt-0.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900">{item.title}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${s.chip}`}>{CONF[item.confidence]} confidence</span>
          </div>
          <p className="text-sm text-slate-700 mt-1">{item.issue}</p>
          {item.financial_impact_cents ? (
            <p className="text-sm font-medium text-slate-900 mt-1">Estimated impact: {formatAUD(item.financial_impact_cents)}/mo</p>
          ) : null}
          <p className="text-xs text-slate-500 mt-1"><span className="font-medium">Reason:</span> {item.reason}</p>
          <p className="text-xs text-slate-500"><span className="font-medium">Recommended:</span> {item.recommended_action}</p>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => onAction?.('evidence', item)} className="text-xs px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">View Evidence</button>
            <button onClick={() => onAction?.('fix', item)} className="text-xs px-2.5 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800">Fix / Take Action</button>
          </div>
        </div>
      </div>
    </div>
  );
}