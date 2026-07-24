import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatValue } from '@/lib/financialFormat';
import { Receipt, RefreshCw } from 'lucide-react';

const TAX_ORDER = ['gst_collected', 'gst_paid', 'net_gst_position', 'gst_free_sales', 'gst_free_purchases', 'input_taxed', 'payg_withholding', 'superannuation_payable'];

export default function TaxResults() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getCurrentFinancialResults', {});
      setResults((res.results || []).filter((r) => r.entity_type === 'tax_line'));
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const byCode = {}; results.forEach((r) => { byCode[r.entity_id] = r; });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Tax Results</h1>
          <p className="text-sm text-zinc-500">Deterministic, reporting-level Australian tax outputs. Tax treatment comes only from approved TaxRate and AccountMapping configuration — no AI inference, no BAS lodgement or advice.</p>
        </div>
        <button onClick={load} className="text-zinc-400 hover:text-zinc-200"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Receipt className="w-4 h-4" /> BAS-period tax totals</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-zinc-500">Loading…</p> : results.length === 0 ? <p className="text-sm text-zinc-600">No tax results yet.</p> : (
            <div className="space-y-2">
              {TAX_ORDER.filter((c) => byCode[c]).map((c) => {
                const r = byCode[c];
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-zinc-800/60 last:border-0">
                    <div>
                      <p className="text-sm text-zinc-200">{r.label}</p>
                      <p className="text-xs text-zinc-500">{r.period_start} → {r.period_end} · confidence {r.confidence}</p>
                    </div>
                    <span className="font-mono tabular-nums text-zinc-100">{formatValue(r.value, r.unit)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}