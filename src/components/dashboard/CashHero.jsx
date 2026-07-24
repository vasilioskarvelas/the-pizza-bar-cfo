import React from 'react';
import { Wallet, TrendingDown, Shield, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/financials';

export default function CashHero({ availableCash, bankTotal, commitments, unfundedTax, runway }) {
  const runwayDisplay = runway == null ? '—' : runway < 1 ? '<1' : Math.round(runway);
  const runwayColor = runway == null ? 'text-zinc-400' : runway >= 12 ? 'text-emerald-400' : runway >= 6 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 p-6 sm:p-8">
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -mr-32 -mt-32" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">Available Cash</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-8 mb-6">
          <div>
            <p className="text-4xl sm:text-5xl font-bold tracking-tight text-white tabular-nums">
              {formatCurrency(availableCash)}
            </p>
            <p className="text-sm text-zinc-500 mt-1">After commitments &amp; unfunded tax</p>
          </div>
          <div className="sm:ml-auto flex items-center gap-2">
            <span className="text-sm text-zinc-500">Runway</span>
            <span className={`text-2xl font-bold tabular-nums ${runwayColor}`}>{runwayDisplay}</span>
            <span className="text-sm text-zinc-500">weeks</span>
          </div>
        </div>

        {/* Cash waterfall */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            <span className="text-zinc-400">Bank balance</span>
            <span className="font-semibold text-zinc-200 tabular-nums">{formatCurrency(bankTotal)}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-600" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-zinc-400">Commitments (7d)</span>
            <span className="font-semibold text-rose-300 tabular-nums">−{formatCurrency(commitments)}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-600" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-zinc-400">Unfunded tax (30d)</span>
            <span className="font-semibold text-amber-300 tabular-nums">−{formatCurrency(unfundedTax)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}