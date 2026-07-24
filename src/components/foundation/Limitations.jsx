import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Limitations({ limitations, notImplemented }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-300">Platform limitations &amp; architectural gaps</h3>
        </div>
        <div className="space-y-2">
          {limitations.map((l) => (
            <div key={l.title} className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-3">
              <p className="text-sm font-medium text-amber-200">{l.title}</p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{l.detail}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">Explicitly NOT implemented in Phase 01</h3>
        <div className="flex flex-wrap gap-1.5">
          {notImplemented.map((n) => (
            <span key={n} className="text-xs px-2 py-1 rounded bg-zinc-800/60 text-zinc-500 border border-zinc-700/40">{n}</span>
          ))}
        </div>
      </div>
    </div>
  );
}