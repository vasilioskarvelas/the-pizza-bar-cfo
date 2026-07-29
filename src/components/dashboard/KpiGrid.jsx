import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { fmtValue, fmtChange, CONF_STYLE, TREND_COLOR, timeAgo } from '@/lib/dashboardFormat';

function KpiCard({ card, onDrill }) {
  const TrendIcon = card.trend === "up" ? TrendingUp : card.trend === "down" ? TrendingDown : Minus;
  return (
    <button onClick={() => card.has_data && onDrill(card)} disabled={!card.has_data}
      className="text-left rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-amber-500/30 transition-colors disabled:cursor-default">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-400 font-medium">{card.label}</span>
        {card.trend !== "no_prior" && card.change != null && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${TREND_COLOR[card.trend]}`}>
            <TrendIcon className="w-3 h-3" />{fmtChange(card.pct)}
          </span>
        )}
      </div>
      <p className={`text-xl font-bold tabular-nums ${card.has_data ? "text-zinc-100" : "text-zinc-700"}`}>
        {card.has_data ? fmtValue(card.value, card.unit) : "—"}
      </p>
      <div className="flex items-center justify-between mt-2">
        <span className={`text-[10px] ${CONF_STYLE[card.confidence] || "text-zinc-600"}`}>{card.confidence || "no data"}</span>
        <span className="text-[10px] text-zinc-600">{card.has_data ? timeAgo(card.updated) : ""}</span>
      </div>
    </button>
  );
}

export default function KpiGrid({ cards, onDrill }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {(cards || []).map((c) => <KpiCard key={c.code} card={c} onDrill={onDrill} />)}
    </div>
  );
}