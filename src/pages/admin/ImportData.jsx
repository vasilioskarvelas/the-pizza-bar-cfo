import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UploadCloud, FileUp, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

const PLATFORMS = [
  { key: 'Bite (POS)', system: 'pos' },
  { key: 'OrderMate (POS)', system: 'pos' },
  { key: 'DoorDash', system: 'delivery' },
  { key: 'Uber Eats', system: 'delivery' },
  { key: 'Bank statement', system: 'banking' },
  { key: 'Other / manual', system: 'manual' },
];

export default function ImportData() {
  const [sites, setSites] = useState([]);
  const [platform, setPlatform] = useState(PLATFORMS[0].key);
  const [siteId, setSiteId] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    base44.entities.Site.list().then((s) => setSites(s || [])).catch(() => {});
  }, []);

  async function handleImport() {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const match = PLATFORMS.find((p) => p.key === platform);
      const res = await base44.functions.invoke('importStatement', {
        source_system: match.system,
        platform: match.key,
        site_id: siteId || null,
        file_url: up.file_url,
      });
      setResult(res.data || res);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  const stats = result?.stats || {};

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Import Data</h1>
        <p className="text-sm text-zinc-500">Upload a CSV, Excel, or PDF statement from your POS or delivery platform. Rows are stored as immutable source records, then processed by the canonical model + financial engine.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">New import</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-400">Platform</span>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm">
                {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.key}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-400">Site (optional)</span>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm">
                <option value="">Organisation-wide</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>

          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-700 rounded-lg py-8 cursor-pointer hover:border-amber-500/40 transition-colors">
            <UploadCloud className="w-7 h-7 text-zinc-500" />
            <span className="text-sm text-zinc-400">{file ? file.name : 'Click to choose a file'}</span>
            <span className="text-xs text-zinc-600">CSV, XLSX, or PDF</span>
            <input type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setError(null); }} />
          </label>

          <Button onClick={handleImport} disabled={!file || busy} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
            {busy ? 'Importing…' : 'Import statement'}
          </Button>

          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-md p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {result && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Import {result.status}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                <span>extracted: <span className="text-zinc-200">{result.rows_extracted}</span></span>
                <span>processed: <span className="text-zinc-200">{stats.processed ?? 0}</span></span>
                <span>imported: <span className="text-emerald-300">{stats.imported ?? 0}</span></span>
                <span>duplicates: <span className="text-zinc-300">{stats.duplicates ?? 0}</span></span>
                <span>failures: <span className="text-rose-300">{stats.failures ?? 0}</span></span>
                <span>superseded: <span className="text-zinc-300">{stats.superseded ?? 0}</span></span>
              </div>
              <p className="text-xs text-zinc-500">Next: Admin → Reconciliation Queue → Build Canonical Model, then Run Financial Calculations to surface this data on the dashboard.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-zinc-600">Each row is stored once (duplicates are detected by reference + content hash). Re-uploading an amended statement supersedes the prior version. Map categories to accounts under Admin → Account Mapping so the engine classifies them correctly.</p>
    </div>
  );
}