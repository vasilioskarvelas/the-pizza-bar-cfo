import React from 'react';

export default function EntityTable({ entities }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/80">
          <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
            <th className="px-4 py-2 font-medium">Entity</th>
            <th className="px-4 py-2 font-medium">Zone</th>
            <th className="px-4 py-2 font-medium">RLS Pattern</th>
            <th className="px-4 py-2 font-medium">Immutable</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {entities.map((e) => (
            <tr key={e.name} className="hover:bg-zinc-900/40">
              <td className="px-4 py-2 font-mono text-zinc-300">{e.name}</td>
              <td className="px-4 py-2 text-zinc-500">{e.zone}</td>
              <td className="px-4 py-2 text-zinc-500">{e.pattern}</td>
              <td className="px-4 py-2">
                {e.immutable
                  ? <span className="text-emerald-400 text-xs font-medium">Yes (false)</span>
                  : <span className="text-zinc-600 text-xs">No</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}