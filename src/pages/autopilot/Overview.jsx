import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { loadSnapshots, comparePeriods, computeHealthScore, healthLabel, healthColor, cashForecast, formatAUD, formatPct, DEMO_BUSINESS } from '@/lib/autopilotEngine';
import ScoreRing from '@/components/autopilot/ScoreRing';
import MetricCard from '@/components/autopilot/MetricCard';
import AttentionCard from '@/components/autopilot/AttentionCard';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';

export default function Overview() {
  const [snapshots, setSnapshots] = useState(null);
  const [items, setItems] = useState(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const snaps = await loadSnapshots();
        setSnapshots(snaps);
        const att = await base44.entities.AttentionItem.filter({ business_id: DEMO_BUSINESS }, '-created_date', 20);
        setItems(att);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  if (!snapshots) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const { current, deltas, refDate } = comparePeriods(snapshots);
  const score = computeHealthScore(current);
  const fc30 = cashForecast(snapshots, 30);

  const onAttentionAction = (type, item) => {
    if (type === 'fix') {
      navigate('/actions');
    } else {
      toast({ title: item.title, description: item.evidence_summary || 'Evidence source: POS, Xero, Payroll, Supplier Invoices.' });
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Pizza Bar Strathmore · {refDate ? new Date(refDate).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) : '—'}</p>
        </div>
        <div className="flex items-center gap-5 bg-white rounded-xl border border-slate-200 px-6 py-4">
          <ScoreRing score={score} />
          <div>
            <p className="text-xs font-medium text-slate-500">Business Health Score</p>
            <p className={`text-xl font-semibold mt-0.5 ${healthColor(score) === 'emerald' ? 'text-emerald-600' : healthColor(score) === 'amber' ? 'text-amber-600' : healthColor(score) === 'orange' ? 'text-orange-600' : 'text-rose-600'}`}>{healthLabel(score)}</p>
            <p className="text-xs text-slate-400 mt-1 max-w-[180px]">A weighted read of profitability, cash, labour and obligations.</p>
          </div>
        </div>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <MetricCard label="Revenue" value={formatAUD(current?.revenue)} delta={deltas.revenue} />
        <MetricCard label="Est. Gross Profit" value={formatAUD(current?.gross_profit)} delta={deltas.gross_profit} />
        <MetricCard label="Est. Operating Profit" value={formatAUD(current?.operating_profit)} delta={deltas.operating_profit} />
        <MetricCard label="Cash Position" value={formatAUD(current?.cash_position)} delta={deltas.cash_position} />
        <MetricCard label="30-Day Cash Forecast" value={formatAUD(fc30.projected)} sub={fc30.shortfall ? `Shortfall projected in 30 days` : 'On track'} />
        <MetricCard label="Labour %" value={formatPct(current?.labour_pct)} delta={deltas.labour_pct} invertGood />
        <MetricCard label="Cost of Goods %" value={formatPct(current?.cogs_pct)} delta={deltas.cogs_pct} invertGood />
        <MetricCard label="Outstanding Receivables" value={formatAUD(current?.outstanding_receivables)} delta={deltas.outstanding_receivables} invertGood />
        <MetricCard label="Bills Due" value={formatAUD(current?.bills_due)} delta={deltas.bills_due} invertGood />
        <MetricCard label="Tax / Super Obligations" value={formatAUD(current?.tax_obligations)} delta={deltas.tax_obligations} invertGood />
      </div>

      {/* Attention */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Things That Need Your Attention</h2>
        <span className="text-xs text-slate-400">{items?.length || 0} active items</span>
      </div>
      {!items ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">Nothing needs attention right now. Your business is tracking well.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {items.map((it) => (
            <AttentionCard key={it.id} item={it} onAction={onAttentionAction} />
          ))}
        </div>
      )}
    </div>
  );
}