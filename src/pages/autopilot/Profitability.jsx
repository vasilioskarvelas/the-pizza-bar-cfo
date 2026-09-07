import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { loadSnapshots, latest, formatAUD, formatPct, DEMO_BUSINESS } from '@/lib/autopilotEngine';

const RATING_TONE = { A: 'bg-emerald-100 text-emerald-700', B: 'bg-slate-100 text-slate-700', C: 'bg-amber-100 text-amber-700', D: 'bg-rose-100 text-rose-700' };

export default function Profitability() {
  const [snapshots, setSnapshots] = useState(null);
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const snaps = await loadSnapshots();
        setSnapshots(snaps);
        const items = await base44.entities.MenuItem.filter({ business_id: DEMO_BUSINESS }, '-contribution_margin_cents', 100);
        setMenu(items);
      } catch (e) { console.error(e); }
    })();
  }, []);

  if (!snapshots || !menu) return <div className="p-8 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const cur = latest(snapshots);
  const grossMargin = cur?.revenue > 0 ? (cur.gross_profit / cur.revenue) * 100 : 0;
  const opMargin = cur?.revenue > 0 ? (cur.operating_profit / cur.revenue) * 100 : 0;
  const sorted = [...menu].sort((a, b) => (b.contribution_margin_cents || 0) - (a.contribution_margin_cents || 0));

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold text-slate-900">Profitability</h1>
      <p className="text-slate-500 mt-1">Margins at the business and menu-item level.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <Stat label="Gross Margin" value={formatPct(grossMargin)} />
        <Stat label="Operating Margin" value={formatPct(opMargin)} />
        <Stat label="Menu Items Tracked" value={menu.length} />
        <Stat label="Low Margin Items" value={menu.filter((m) => m.profitability_rating === 'D').length} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 mt-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-900">Menu item profitability</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Item</th>
                <th className="text-left px-3 py-2 font-medium">Category</th>
                <th className="text-right px-3 py-2 font-medium">Price</th>
                <th className="text-right px-3 py-2 font-medium">Ingredient</th>
                <th className="text-right px-3 py-2 font-medium">Contribution</th>
                <th className="text-right px-3 py-2 font-medium">Qty</th>
                <th className="text-center px-3 py-2 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const margin = m.selling_price_cents > 0 ? (m.contribution_margin_cents / m.selling_price_cents) * 100 : 0;
                return (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-900">{m.name}</td>
                    <td className="px-3 py-3 text-slate-500">{m.category}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatAUD(m.selling_price_cents)}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatAUD(m.ingredient_cost_cents)}{m.ingredient_cost_change_pct ? <span className="text-rose-600 text-xs ml-1">+{m.ingredient_cost_change_pct.toFixed(1)}%</span> : null}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-900">{formatAUD(m.contribution_margin_cents)} <span className="text-slate-400 text-xs">({margin.toFixed(0)}%)</span></td>
                    <td className="px-3 py-3 text-right text-slate-600">{m.sales_quantity}</td>
                    <td className="px-3 py-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RATING_TONE[m.profitability_rating]}`}>{m.profitability_rating}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 bg-slate-900 text-white rounded-xl p-5">
        <h3 className="font-semibold">Menu insight</h3>
        <p className="text-sm text-slate-300 mt-1">
          {menu[0]?.name} sold {menu[0]?.sales_quantity} units this month. Ingredient cost increased {menu[0]?.ingredient_cost_change_pct?.toFixed(0)}%.
          Current contribution margin: {menu[0]?.selling_price_cents > 0 ? Math.round((menu[0]?.contribution_margin_cents / menu[0]?.selling_price_cents) * 100) : 0}%.
          A $1 price increase could generate approximately {formatAUD((menu[0]?.sales_quantity || 0) * 100)} additional monthly contribution assuming current volume.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900 mt-1">{value}</p>
    </div>
  );
}