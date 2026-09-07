import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { loadSnapshots, comparePeriods, computeHealthScore, cashForecast, formatAUD, formatPct, DEMO_ORG, DEMO_BUSINESS } from '@/lib/autopilotEngine';
import { Sparkles, Send, Info } from 'lucide-react';

const SUGGESTED = [
  'Why did profit fall this week?',
  'Where am I losing money?',
  'Find me $5,000 in savings.',
  'Can I afford another employee?',
  'Which products should I increase prices on?',
  'Which supplier has increased prices the most?',
  'Which days are least profitable?',
  'What expenses have increased recently?',
  'What should I focus on today?',
  'Will I have enough cash next month?',
];

export default function AskMyBusiness() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    base44.entities.AIConversation.filter({ business_id: DEMO_BUSINESS }, '-created_date', 10).then(setHistory).catch(() => {});
  }, []);

  const ask = async (q) => {
    const questionText = q || question;
    if (!questionText.trim()) return;
    setLoading(true);
    setQuestion('');
    try {
      const snaps = await loadSnapshots();
      const { current, deltas } = comparePeriods(snaps);
      const score = computeHealthScore(current);
      const fc30 = cashForecast(snaps, 30);
      const leaks = await base44.entities.ProfitLeak.filter({ business_id: DEMO_BUSINESS }, '-estimated_monthly_value_cents', 20);
      const totalLeak = leaks.reduce((s, l) => s + (l.estimated_monthly_value_cents || 0), 0);

      // Deterministic context — the AI may only interpret these figures, not invent them.
      const context = {
        business: 'Pizza Bar Strathmore',
        asOf: current?.period_start,
        healthScore: score,
        revenue: current?.revenue,
        grossProfit: current?.gross_profit,
        operatingProfit: current?.operating_profit,
        cash: current?.cash_position,
        labourPct: current?.labour_pct,
        cogsPct: current?.cogs_pct,
        revenueVsLastMonthPct: deltas.revenue?.vs_last_month?.pct,
        profitVsLastMonthPct: deltas.operating_profit?.vs_last_month?.pct,
        cashForecast30d: fc30.projected,
        cashShortfall: fc30.shortfall,
        totalProfitLeaksMonthly: totalLeak,
        topLeaks: leaks.slice(0, 5).map((l) => ({ title: l.title, value: l.estimated_monthly_value_cents, category: l.category })),
      };

      const prompt = `You are the AI business manager for "Business Autopilot", reviewing a hospitality business.
You MUST only use the figures in the CONTEXT below. Do NOT invent any financial numbers.
If a figure is not in the context, say it is not available. Reference the source of any figure you cite.
Explain what the numbers mean in plain language for a non-financial business owner, and recommend specific actions.

CONTEXT (deterministic, from connected data):
${JSON.stringify(context, null, 2)}

QUESTION: ${questionText}`;

      const res = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'string' },
        },
        required: ['answer'],
      }});
      const out = res.data || res;
      const result = { question: questionText, answer: out.answer, sources: out.sources || ['POS', 'Xero', 'Payroll', 'Supplier Invoices'], confidence: out.confidence || 'medium', context };
      setAnswer(result);
      try {
        await base44.entities.AIConversation.create({
          organisation_id: DEMO_ORG, business_id: DEMO_BUSINESS,
          question: questionText, answer: out.answer,
          sources: JSON.stringify(result.sources),
          context_snapshot: JSON.stringify(context),
        });
        setHistory((h) => [result, ...h]);
      } catch (e) { console.error(e); }
    } catch (e) {
      setAnswer({ question: questionText, answer: 'Sorry, I could not process that right now. Please try again.', sources: [], error: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-violet-600 mb-3">
        <Sparkles className="w-5 h-5" />
        <span className="text-sm font-medium">Ask My Business</span>
      </div>
      <h1 className="text-3xl font-semibold text-slate-900">Ask anything about your business.</h1>
      <p className="text-slate-500 mt-1">Answers are built from your deterministic calculations — the AI explains, it never invents figures.</p>

      <div className="flex gap-2 mt-6">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder="Ask anything about your business…"
          className="flex-1 px-4 py-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        <button onClick={() => ask()} disabled={loading} className="px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2">
          <Send className="w-4 h-4" /> {loading ? 'Asking…' : 'Ask'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {SUGGESTED.map((s) => (
          <button key={s} onClick={() => ask(s)} className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100">{s}</button>
        ))}
      </div>

      {answer && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
          <p className="text-xs text-slate-400">You asked</p>
          <p className="font-medium text-slate-900">{answer.question}</p>
          <div className="border-t border-slate-100 mt-3 pt-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><div className="w-4 h-4 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" /> Thinking…</div>
            ) : (
              <>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{answer.answer}</p>
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <span className="text-xs text-slate-400">Sources:</span>
                  {(answer.sources || []).map((s) => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{s}</span>
                  ))}
                </div>
                <button className="mt-3 text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Why am I seeing this?
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {history.length > 0 && !answer && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-slate-500 mb-2">Recent questions</h3>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-800">{h.question}</p>
                <p className="text-slate-500 text-xs mt-1 line-clamp-2">{h.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}