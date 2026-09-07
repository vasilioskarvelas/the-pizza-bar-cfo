import React from 'react';
import { healthColor } from '@/lib/autopilotEngine';

const COLOR_MAP = { emerald: '#10b981', amber: '#f59e0b', orange: '#f97316', rose: '#f43f5e' };

export default function ScoreRing({ score, size = 150 }) {
  const r = (size - 18) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score || 0)) / 100;
  const color = COLOR_MAP[healthColor(score)];
  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="11" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-slate-900">{Math.round(score || 0)}</span>
        <span className="text-[11px] text-slate-400">out of 100</span>
      </div>
    </div>
  );
}