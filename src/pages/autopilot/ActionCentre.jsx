import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatAUD, DEMO_ORG, DEMO_BUSINESS } from '@/lib/autopilotEngine';
import { useToast } from '@/components/ui/use-toast';

const STATUSES = ['new', 'review', 'approved', 'in_progress', 'completed', 'dismissed'];
const STATUS_TONE = {
  new: 'bg-slate-100 text-slate-700',
  review: 'bg-blue-100 text-blue-700',
  approved: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-rose-100 text-rose-700',
};
const NEXT = { new: 'review', review: 'approved', approved: 'in_progress', in_progress: 'completed' };

export default function ActionCentre() {
  const [actions, setActions] = useState(null);
  const [filter, setFilter] = useState('all');
  const { toast } = useToast();

  const load = async () => {
    const rows = await base44.entities.ActionItem.filter({ business_id: DEMO_BUSINESS }, '-created_date', 100);
    setActions(rows);
  };
  useEffect(() => { load().catch(console.error); }, []);

  const advance = async (a) => {
    const next = NEXT[a.status];
    if (!next) return;
    await base44.entities.ActionItem.update(a.id, { status: next });
    toast({ title: `Moved to ${next.replace('_', ' ')}` });
    load();
  };

  const dismiss = async (a) => {
    await base44.entities.ActionItem.update(a.id, { status: 'dismissed' });
    toast({ title: 'Action dismissed' });
    load();
  };

  if (!actions) return <div className="p-8 flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;

  const filtered = filter === 'all' ? actions : actions.filter((a) => a.status === filter);
  const counts = STATUSES.reduce((m, s) => { m[s] = actions.filter((a) => a.status === s).length; return m; }, {});
  const totalValue = actions.filter((a) => a.status !== 'dismissed' && a.status !== 'completed').reduce((s, a) => s + (a.estimated_value_cents || 0), 0);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold text-slate-900">Action Centre</h1>
      <p className="text-slate-500 mt-1">Review and approve recommended actions. Nothing happens automatically — you stay in control.</p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-4 text-sm text-amber-800">
        Business Autopilot will never autonomously move money, pay suppliers, change payroll, lodge tax, sign contracts or terminate staff. Every action requires your approval.
      </div>

      <div className="flex items-center gap-2 mt-5 flex-wrap">
        <button onClick={() => setFilter('all')} className={`text-xs px-3 py-1.5 rounded-full ${filter === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>All ({actions.length})</button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`text-xs px-3 py-1.5 rounded-full ${filter === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{s.replace('_', ' ')} ({counts[s]})</button>
        ))}
      </div>

      <div className="space-y-2 mt-5">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">No actions in this view.</div>
        ) : filtered.map((a) => (
          <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-900">{a.title}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_TONE[a.status]}`}>{a.status.replace('_', ' ')}</span>
              </div>
              {a.estimated_value_cents ? <p className="text-sm text-slate-600 mt-0.5">Estimated value: {formatAUD(a.estimated_value_cents)}/mo</p> : null}
              {a.due_date ? <p className="text-xs text-slate-400 mt-0.5">Due {a.due_date}</p> : null}
              {a.notes ? <p className="text-xs text-slate-500 mt-1">{a.notes}</p> : null}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {NEXT[a.status] && (
                <button onClick={() => advance(a)} className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800">Mark as {NEXT[a.status].replace('_', ' ')}</button>
              )}
              {a.status !== 'dismissed' && a.status !== 'completed' && (
                <button onClick={() => dismiss(a)} className="text-xs px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50">Dismiss</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}