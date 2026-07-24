import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, ChevronRight, FileText, Database, GitBranch, Calculator } from 'lucide-react';
import { fmtValue, scoreColor, CONF_STYLE } from '@/lib/dashboardFormat';

// target: { kind: "owner" | "kpi", result_id, title }
export default function DrillDownModal({ target, onClose }) {
  const [lineage, setLineage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!target?.result_id) return;
    setLoading(true); setError(null); setLineage(null);
    const fn = target.kind === "owner" ? "getOwnerScoreLineage" : "getCalculationLineage";
    base44.functions.invoke(fn, { calculation_result_id: target.result_id })
      .then((r) => setLineage(r)).catch((e) => setError(String(e.message || e))).finally(() => setLoading(false));
  }, [target]);

  if (!target) return null;
  const result = lineage?.result;
  const links = lineage?.lineage || [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-200">{target.title || "Drill-down"}</h3>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2 text-sm">
          <Crumb label="Owner Score" active={target.kind === "owner"} />
          <Crumb label="Component" />
          <Crumb label="KPI" />
          <Crumb label="Calculation Result" active={target.kind === "kpi"} />
          <Crumb label="Canonical Transaction" />
          <Crumb label="Source Record" last />
        </div>
        {result && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs text-zinc-400">Result</span>
            </div>
            <p className="text-sm text-zinc-200 font-medium">{result.label}</p>
            <p className="text-xs text-zinc-500">value: <span className="font-mono text-zinc-200">{fmtValue(result.value, result.unit)}</span> · confidence: <span className={CONF_STYLE[result.confidence] || "text-zinc-400"}>{result.confidence}</span></p>
            <p className="text-[10px] text-zinc-600 mt-1">period {result.period_start}→{result.period_end} · run {result.calculation_run_id?.slice(-8)}</p>
          </div>
        )}
        {loading && <p className="text-sm text-zinc-500 mt-4">Loading lineage…</p>}
        {error && <p className="text-sm text-rose-400 mt-4">{error}</p>}
        {!loading && links.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-zinc-300 mb-2 flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" /> Lineage ({links.length} inputs)</p>
            <div className="space-y-1.5 max-h-72 overflow-auto">
              {links.map((l, i) => {
                const link = l.link || l;
                const isSource = link.input_type === "source_record";
                const Icon = isSource ? Database : link.input_type === "configuration" ? FileText : Calculator;
                return (
                  <div key={link.id || i} className="flex items-start gap-2 text-xs rounded-lg bg-zinc-900/40 border border-zinc-800 p-2">
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isSource ? "text-sky-400" : "text-zinc-500"}`} />
                    <div className="min-w-0">
                      <p className="text-zinc-300">{link.input_type} · {link.field_path || "—"}</p>
                      <p className="text-zinc-600 font-mono text-[10px]">{link.input_record_id?.slice(-12)}{link.weight != null ? ` · weight ${link.weight}` : ""}</p>
                      {l.config_field && <p className="text-[10px] text-amber-400/70">{l.config_field}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!loading && !error && links.length === 0 && result && <p className="text-xs text-zinc-600 mt-4">No further lineage recorded for this result.</p>}
      </div>
    </div>
  );
}

function Crumb({ label, active, last }) {
  return (
    <span className="inline-flex items-center text-xs">
      <span className={active ? "text-amber-400 font-medium" : "text-zinc-500"}>{label}</span>
      {!last && <ChevronRight className="w-3 h-3 text-zinc-700 mx-0.5" />}
    </span>
  );
}