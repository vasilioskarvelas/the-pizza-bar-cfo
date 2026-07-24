import React from 'react';

const STATUS_STYLE = {
  enforced: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  rule_in_place: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  partial: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  not_implemented: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
};

const STATUS_LABEL = {
  enforced: 'Enforced',
  rule_in_place: 'Rule in place',
  partial: 'Partial',
  not_implemented: 'Not implemented',
};

export default function TestResults({ tests }) {
  return (
    <div className="space-y-2">
      {tests.map((t) => (
        <div key={t.id} className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3">
          <div className="flex items-start gap-3">
            <span className={`text-xs font-medium px-2 py-0.5 rounded border shrink-0 ${STATUS_STYLE[t.status]}`}>
              {STATUS_LABEL[t.status]}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-zinc-300">{t.name}</p>
              <p className="text-xs text-zinc-600 mt-0.5">{t.detail}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}