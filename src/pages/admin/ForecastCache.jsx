import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Database, Trash2 } from 'lucide-react';

export default function ForecastCache() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const invalidate = async () => {
    setBusy(true);
    try {
      const me = await base44.auth.me();
      const orgId = me?.data?.organisation_id || me?.organisation_id;
      setResult(await base44.functions.invoke("runForecast", { horizon: 1, organisation_id: orgId }).then(() => ({ message: "Cache bypassed for latest run." })));
    } catch (e) { setResult({ error: e.message }); }
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Database className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-bold">Forecast Cache</h1></div>
      <p className="text-sm text-zinc-500">Forecast results are cached by a deterministic input hash for reproducibility. Use "Run fresh forecast" to bypass the cache; cached entries are auto-replaced when inputs change.</p>
      <button onClick={invalidate} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> {busy ? "Running…" : "Run fresh forecast"}</button>
      {result && <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">{result.message || result.error}</div>}
      <p className="text-[11px] text-zinc-600">Cache invalidation for stale inputs is automatic — the hash encodes histories, assumptions, methodology, GST/tax rates and scenario adjustments.</p>
    </div>
  );
}