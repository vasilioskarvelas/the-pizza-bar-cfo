import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { loadSnapshots, comparePeriods, formatAUD, formatPct, DEMO_BUSINESS } from '@/lib/autopilotEngine';
import { Sunrise, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DailyBrief() {
  const [brief, setBrief] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const snaps = await loadSnapshots();
        const { current } = comparePeriods(snaps);
        const briefs = await base44.entities.DailyBrief.filter({ business_id: DEMO_BUSINESS }, '-brief_date', 1);
        const att = await base44.entities.AttentionItem.filter({ business_id: DEMO_BUSINESS, severity: { $in: ['red', 'orange'] } }, '-created_date', 3);
        setBrief({ ...current, ...(briefs[0] || {}) });
        setItems(att);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const attentionList = brief?.attention_items ? safeParse(brief.attention_items) : items.map((i) => i.title);
  const actions = brief?.recommended_actions ? safeParse(brief.recommended_actions) : defaultActions(items);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-amber-600 mb-4">
        <Sunrise className="w-5 h-5" />
        <span className="text-sm font-medium">Daily Brief</span>
      </div>
      <h1 className="text-3xl font-semibold text-slate-900">Good morning.</h1>
      <p className="text-slate-500 mt-1">Here's how yesterday landed and what to focus on today.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <Stat label="Yesterday Revenue" value={formatAUD(brief?.revenue)} />
        <Stat label="Est. Profit" value={formatAUD(brief?.estimated_profit)} />
        <Stat label="Labour %" value={formatPct(brief?.labour_pct)} />
        <Stat label="COGS %" value={formatPct(brief?.cogs_pct)} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mt-6">
        <h2 className="font-semibold text-slate-900 mb-3">{attentionList.length} things require attention</h2>
        <ol className="space-y-2">
          {attentionList.map((a, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-700">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0">{i + 1}</span>
              <span>{typeof a === 'string' ? a : a.text}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mt-4">
        <h2 className="font-semibold text-slate-900 mb-3">Recommended Actions Today</h2>
        <ul className="space-y-2">
          {actions.map((a, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm text-slate-700 py-2 border-b border-slate-100 last:border-0">
              <span>{typeof a === 'string' ? a : a.text}</span>
              <button onClick={() => navigate('/actions')} className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1">Open <ArrowRight className="w-3 h-3" /></button>
            </li>
          ))}
        </ul>
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

function safeParse(s) { try { return JSON.parse(s); } catch { return []; } }
function defaultActions(items) {
  return items.map((i) => i.recommended_action).filter(Boolean);
}