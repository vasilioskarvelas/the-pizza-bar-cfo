import React from 'react';
import { Pizza, Calendar } from 'lucide-react';

export default function DashboardHeader({ sites, selectedSite, onSelectSite }) {
  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Pizza className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Pizza Bar CFO</h1>
          <p className="text-xs text-zinc-500 font-medium">Hospitality Financial Operating System</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/80 border border-zinc-800">
          <Calendar className="w-4 h-4 text-zinc-500" />
          <span className="text-sm text-zinc-400 font-medium">{today}</span>
        </div>
        {sites?.length > 0 && (
          <select
            value={selectedSite || 'all'}
            onChange={(e) => onSelectSite(e.target.value)}
            className="px-3 py-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-sm text-zinc-300 font-medium focus:outline-none focus:border-amber-500/50 cursor-pointer"
          >
            <option value="all">All Sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>
    </header>
  );
}