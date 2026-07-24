import React from 'react';

export default function ZoneMap({ zones }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {zones.map((z) => (
        <div key={z.name} className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-amber-400 font-mono">{z.name}</span>
            <span className="text-xs text-zinc-600">{z.entities.length} {z.entities.length === 1 ? 'entity' : 'entities'}</span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed mb-2">{z.description}</p>
          {z.entities.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {z.entities.map((e) => (
                <span key={e} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{e}</span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-zinc-700 italic">Not yet populated</span>
          )}
        </div>
      ))}
    </div>
  );
}