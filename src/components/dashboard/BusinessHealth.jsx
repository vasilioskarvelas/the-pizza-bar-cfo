import React from 'react';
import { scoreColor, CONF_STYLE, timeAgo } from '@/lib/dashboardFormat';

export default function BusinessHealth({ items }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((h) => (
        <div key={h.code} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-400 font-medium mb-1">{h.label}</p>
          <p className={`text-2xl font-bold tabular-nums ${scoreColor(h.score)}`}>{h.score != null ? Number(h.score).toFixed(1) : "—"}</p>
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[10px] ${CONF_STYLE[h.confidence] || "text-zinc-600"}`}>{h.confidence || "—"}</span>
            <span className="text-[10px] text-zinc-600">{timeAgo(h.updated)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}