import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ClipboardCheck, Upload, Trash2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const STATUS_STYLE = { passed: 'text-emerald-400', failed: 'text-rose-400', blocked: 'text-amber-400' };
const STATUS_ICON = { passed: CheckCircle2, failed: XCircle, blocked: AlertCircle };

export default function ExternalTestResults() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const recs = await base44.entities.ExternalTestResult.list('-imported_at', 200);
      setResults(recs || []);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function importResults() {
    setBusy(true);
    setMsg(null);
    try {
      const parsed = JSON.parse(paste);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const validStatus = ['passed', 'failed', 'blocked'];
      const validSuite = ['ci', 'preview', 'e2e', 'permissions', 'isolation', 'load', 'dataset', 'backup', 'scheduled', 'smoke'];
      const rejected = [];
      const seen = new Set(results.map((r) => `${r.test_id}|${r.environment || ''}`));
      const clean = [];
      for (const r of list) {
        const id = r.test_id || '(no test_id)';
        if (!r.test_id || !r.suite || !r.status) { rejected.push(id); continue; }
        if (!validStatus.includes(r.status) || !validSuite.includes(r.suite)) { rejected.push(id); continue; }
        const key = `${r.test_id}|${r.environment || ''}`;
        if (seen.has(key)) { rejected.push(`${id} (duplicate)`); continue; }
        seen.add(key);
        clean.push({
          test_id: r.test_id, suite: r.suite, environment: r.environment || '',
          command: r.command || '', started_at: r.started_at || null, completed_at: r.completed_at || null,
          exit_code: Number(r.exit_code) || 0, status: r.status,
          metrics: JSON.stringify(r.metrics || {}), errors: JSON.stringify(r.errors || []),
          evidence: JSON.stringify(r.evidence || []), imported_at: new Date().toISOString(),
        });
      }
      if (!clean.length) {
        setMsg({ type: 'error', text: `No valid results imported. Rejected ${rejected.length}: ${rejected.join(', ')}` });
        setBusy(false);
        return;
      }
      const created = await base44.entities.ExternalTestResult.bulkCreate(clean);
      setMsg({ type: 'success', text: `Imported ${created.length}. Rejected ${rejected.length}.` });
      setPaste('');
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
    setBusy(false);
  }

  async function clearAll() {
    if (!window.confirm('Delete all imported test results?')) return;
    setBusy(true);
    try {
      await base44.entities.ExternalTestResult.deleteMany({});
      setMsg({ type: 'success', text: 'Cleared.' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
    setBusy(false);
  }

  const passCount = results.filter((r) => r.status === 'passed').length;
  const failCount = results.filter((r) => r.status === 'failed').length;
  const blockedCount = results.filter((r) => r.status === 'blocked').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-amber-500" />
        <div>
          <h1 className="text-lg font-semibold">External Test Results</h1>
          <p className="text-sm text-zinc-500">Import and review external Phase 14 verification results (CI, preview, e2e, load, isolation, backup).</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Passed" value={passCount} tone="emerald" />
        <Stat label="Failed" value={failCount} tone="rose" />
        <Stat label="Blocked" value={blockedCount} tone="amber" />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <label className="text-sm font-medium text-zinc-300">Paste result(s) — JSON object or array (see docs/phase14/external-results-schema.json)</label>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={6}
          placeholder='[{ "test_id": "ci-build", "suite": "ci", "status": "passed", "exit_code": 0, "metrics": { "bundle_kb": 480 } }]'
          className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={importResults}
            disabled={busy || !paste}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" /> Import
          </button>
          <button
            onClick={clearAll}
            disabled={busy || !results.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" /> Clear all
          </button>
        </div>
        {msg && (
          <p className={`mt-2 text-sm ${msg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</p>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : !results.length ? (
        <div className="text-sm text-zinc-500">No results imported yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Test ID</th>
                <th className="px-3 py-2">Suite</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Exit</th>
                <th className="px-3 py-2">Environment</th>
                <th className="px-3 py-2">Imported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {results.map((r) => {
                const Icon = STATUS_ICON[r.status] || AlertCircle;
                return (
                  <tr key={r.id} className="hover:bg-zinc-900/40">
                    <td className="px-3 py-2 font-mono text-xs text-zinc-300">{r.test_id}</td>
                    <td className="px-3 py-2 text-zinc-400">{r.suite}</td>
                    <td className={`px-3 py-2 inline-flex items-center gap-1.5 ${STATUS_STYLE[r.status] || 'text-zinc-400'}`}>
                      <Icon className="w-4 h-4" /> {r.status}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-400">{r.exit_code}</td>
                    <td className="px-3 py-2 text-zinc-400">{r.environment || '—'}</td>
                    <td className="px-3 py-2 text-zinc-500 text-xs">{(r.imported_at || '').slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const toneClass = { emerald: 'text-emerald-400', rose: 'text-rose-400', amber: 'text-amber-400' }[tone];
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="text-xs uppercase text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}