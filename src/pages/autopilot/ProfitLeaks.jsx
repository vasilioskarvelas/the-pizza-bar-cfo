import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatAUD, sum, DEMO_BUSINESS } from '@/lib/autopilotEngine';
import { TrendingDown, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CATEGORY_LABELS = {
  excess_labour: 'Excess Labour',
  supplier_price_increase: 'Supplier Price Increases',
  underpriced_products: 'Underpriced Products',
  overdue_invoices: 'Overdue Invoices',
  unused_subscriptions: 'Unused Subscriptions',
  merchant_fees: 'Merchant Fees',
  duplicate_expenses: 'Duplicate Expenses',
  unusual_expenses: 'Unusual Expenses',
  waste: 'Waste',
  poor_sales_channels: 'Poor Sales Channels',
  low_margin_products: 'Low Margin Products',
  excessive_discounts: 'Excessive Discounts',
  unprofitable_customers: 'Unprofitable Customers',
  unprofitable_jobs: 'Unprofitable Jobs',
};

export default function ProfitLeaks() {
  const [leaks, setLeaks] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const rows = await base44.entities.ProfitLeak.filter({ business_id: DEMO_BUSINESS }, '-estimated_monthly_value_cents', 100);
        setLeaks(rows);
      } catch (e) { console.error(e); }
    })();
  }, []);

  if (!leaks) return <div className="p-8 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const identified = sum(leaks.filter((l) => l.status !== 'dismissed'), 'estimated_monthly_value_cents');
  const approved = sum(leaks.filter((l) => l.status === 'approved' || l.status === 'realised'), 'estimated_monthly_value_cents');
  const realised = sum(leaks.filter((l) => l.status === 'realised'), 'estimated_monthly_value_cents');

  const byCategory = {};
  for (const l of leaks) {
    if (l.status === 'dismissed') continue;
    if (!byCategory[l.category]) byCategory[l.category] = { value: 0, items: [] };
    byCategory[l.category].value += l.estimated_monthly_value_cents;
    byCategory[l.category].items.push(l);
  }
  const cats = Object.entries(byCategory).sort((a, b) => b[1].value - a[1].value);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-rose-600 mb-3">
        <TrendingDown className="w-5 h-5" />
        <span className="text-sm font-medium">Profit Leaks</span>
      </div>
      <h1 className="text-3xl font-semibold text-slate-900">We found {formatAUD(identified)} per month in potential profit improvements.</h1>
      <p className="text-slate-500 mt-1">Each item is backed by deterministic calculations from your connected data.</p>

      <div className="grid grid-cols-3 gap-3 mt-6">
        <ValueStat label="Potential Value Identified" value={formatAUD(identified)} tone="slate" />
        <ValueStat label="Value Approved" value={formatAUD(approved)} tone="amber" />
        <ValueStat label="Value Realised" value={formatAUD(realised)} tone="emerald" />
      </div>

      <div className="space-y-3 mt-8">
        {cats.map(([cat, info]) => (
          <div key={cat} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{CATEGORY_LABELS[cat] || cat}</h3>
                <p className="text-sm text-slate-500 mt-0.5">{info.items.length} item{info.items.length > 1 ? 's' : ''} found</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Potential monthly {cat.includes('underpriced') ? 'additional profit' : 'saving'}</p>
                <p className="text-xl font-semibold text-slate-900">{formatAUD(info.value)}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {info.items.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3 py-2 border-t border-slate-100">
                  <div className="text-sm">
                    <p className="text-slate-800 font-medium">{l.title}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{l.evidence}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium text-slate-900">{formatAUD(l.estimated_monthly_value_cents)}</span>
                    <button onClick={() => navigate('/actions')} className="text-xs px-2 py-1 rounded-md border border-slate-300 hover:bg-slate-50 flex items-center gap-1">Take action <ArrowRight className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValueStat({ label, value, tone }) {
  const tones = { slate: 'text-slate-900', amber: 'text-amber-600', emerald: 'text-emerald-600' };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tones[tone]}`}>{value}</p>
    </div>
  );
}