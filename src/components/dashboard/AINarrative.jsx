import React from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

export default function AINarrative({ narrative, loading }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/10 via-zinc-900/50 to-zinc-900/50 border border-amber-500/20 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-200">AI Daily Narrative</h3>
        <span className="ml-auto text-xs text-zinc-600">Deterministic figures · AI explains</span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-3">
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
          <span className="text-sm text-zinc-500">Analysing today's figures…</span>
        </div>
      ) : (
        <p className="text-sm text-zinc-300 leading-relaxed">{narrative}</p>
      )}
    </div>
  );
}