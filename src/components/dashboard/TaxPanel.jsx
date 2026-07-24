import React from 'react';
import { Receipt, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/financials';

const TYPE_LABELS = {
  GST: 'GST',
  PAYG_withholding: 'PAYG Withholding',
  PAYG_instalment: 'PAYG Instalment',
  super_guarantee: 'Superannuation',
  payroll_tax: 'Payroll Tax',
  company_tax: 'Company Tax',
};

export default function TaxPanel({ obligations }) {
  const upcoming = (obligations || [])
    .filter((o) => o.status !== 'paid')
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

  return (
    <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-zinc-300">Tax Obligations</h3>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm text-zinc-600 py-4 text-center">No upcoming obligations</p>
      ) : (
        <div className="space-y-3">
          {upcoming.map((o) => {
            const fundedPct = o.amount > 0 ? (o.funded_amount / o.amount) * 100 : 100;
            const isUnderfunded = fundedPct < 100;
            return (
              <div key={o.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-300 truncate">{TYPE_LABELS[o.obligation_type] || o.obligation_type}</p>
                  <p className="text-xs text-zinc-600">{o.period_label || '—'}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden max-w-[100px]">
                      <div className={`h-full rounded-full ${isUnderfunded ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${fundedPct}%` }} />
                    </div>
                    <span className="text-xs text-zinc-600 tabular-nums">{Math.round(fundedPct)}%</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-white tabular-nums">{formatCurrency(o.amount)}</p>
                  <p className="text-xs text-zinc-600">due {new Date(o.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}