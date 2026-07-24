import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Search } from 'lucide-react';

export default function CalculationLineage() {
  const [resultId, setResultId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchLineage() {
    if (!resultId) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await base44.functions.invoke('getCalculationLineage', { calculation_result_id: resultId });
      setData(res);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Calculation Lineage</h1>
        <p className="text-sm text-zinc-500">Drill down from any financial output through intermediate CalculationResults to the immutable SourceRecord. Full reproducibility.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Search className="w-4 h-4" /> Trace a result</CardTitle></CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="flex-1"><Label className="text-xs">Calculation Result ID</Label><Input value={resultId} onChange={(e) => setResultId(e.target.value)} placeholder="6a631..." /></div>
          <Button disabled={loading || !resultId} onClick={fetchLineage}><GitBranch className="w-4 h-4 mr-1" /> Trace</Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {data && (
        <div className="space-y-4">
          <Card><CardContent className="pt-4 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">{data.result?.entity_type}</Badge>
              <span className="font-semibold text-zinc-200">{data.result?.label}</span>
            </div>
            <p className="text-xs text-zinc-500">value {data.result?.value} {data.result?.unit} · confidence {data.result?.confidence} · run {data.result?.calculation_run_id}</p>
            {data.result?.supersedes_result_id && <p className="text-xs text-amber-400 mt-1">supersedes {data.result.supersedes_result_id}</p>}
          </CardContent></Card>

          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200 mb-3"><GitBranch className="w-4 h-4" /> Inputs ({data.lineage?.length || 0})</h2>
            <div className="space-y-2">
              {data.lineage?.map((l, i) => (
                <Card key={i}><CardContent className="pt-4 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs text-amber-400">{l.link.input_type}</Badge>
                    <span className="text-zinc-400 text-xs font-mono">{l.link.field_path}</span>
                  </div>
                  {l.input && (
                    <p className="text-xs text-zinc-400">
                      → {l.input.label} ({l.input.entity_type}/{l.input.entity_id}) = {l.input.value} {l.input.unit}
                    </p>
                  )}
                  {l.source && (
                    <p className="text-xs text-sky-400 mt-1">↳ SourceRecord: {l.source.external_record_id} ({l.source.source_system}) — raw_payload present</p>
                  )}
                  {l.commitment && (
                    <p className="text-xs text-emerald-400 mt-1">↳ ManualCommitment: {l.commitment.commitment_class} ${l.commitment.amount} due {l.commitment.due_date} ({l.commitment.status})</p>
                  )}
                  <p className="text-xs text-zinc-600 font-mono mt-0.5">{l.link.input_calculation_result_id || l.link.input_commitment_id || l.link.input_record_id}</p>
                </CardContent></Card>
              ))}
              {data.lineage?.length === 0 && <p className="text-sm text-zinc-600">No inputs (source line).</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}