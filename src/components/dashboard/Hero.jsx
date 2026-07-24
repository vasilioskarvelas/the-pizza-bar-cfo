import React from 'react';
import { Gauge, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { scoreColor, statusColor, CONF_STYLE, TREND_COLOR, timeAgo } from '@/lib/dashboardFormat';

export default function Hero({ ownerScore, onClick }) {
  const score = ownerScore?.current?.score?.value;
  const status = ownerScore?.current?.score?.label?.replace("Owner Score — ", "");
  const conf = ownerScore?.current?.score?.confidence;
  const trend = ownerScore?.trend;
  const updated = ownerScore?.current?.score?.run?.run_completed_at;
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <button onClick={onClick} className="w-full text-left rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-6 hover:border-amber-500/30 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="relative w-24 h-24 rounded-full border-4 border-zinc-800 flex items-center justify-center">
            <span className={`text-3xl font-bold tabular-nums ${scoreColor(score)}`}>{score != null ? Number(score).toFixed(0) : "—"}</span>
            <Gauge className="absolute -bottom-1 -right-1 w-5 h-5 text-zinc-600 bg-zinc-950 rounded-full p-0.5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Owner Score</p>
            <p className={`text-lg font-semibold ${statusColor(status)}`}>{status || "Not yet calculated"}</p>
            <p className={`text-xs ${CONF_STYLE[conf] || "text-zinc-500"}`}>confidence: {conf || "—"}</p>
          </div>
        </div>
        <div className="sm:ml-auto flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-xs uppercase tracking-wider">Trend</span>
            <span className={`flex items-center gap-1 font-medium ${TREND_COLOR[trend]}`}>
              <TrendIcon className="w-4 h-4" /> {trend === "no_prior" ? "no prior" : trend}
            </span>
          </div>
          <div className="text-xs text-zinc-500">Updated {timeAgo(updated)}</div>
          <div className="text-[11px] text-zinc-600">Click for full breakdown →</div>
        </div>
      </div>
    </button>
  );
}