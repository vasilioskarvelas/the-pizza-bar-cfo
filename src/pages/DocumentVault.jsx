import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { FolderLock, RefreshCw, Upload, ChevronRight } from 'lucide-react';

const CATEGORIES = ['bas','tax_return','financial_statement','insurance','lease','contract','policy','licence','certificate','other'];
const CAT_LABEL = { bas: 'BAS', tax_return: 'Tax Return', financial_statement: 'Financial Statement', insurance: 'Insurance', lease: 'Lease', contract: 'Contract', policy: 'Policy', licence: 'Licence', certificate: 'Certificate', other: 'Other' };

export default function DocumentVault() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'bas', file_url: '', expiry_date: '', notes: '' });
  const [versionUrl, setVersionUrl] = useState({});

  const load = async () => {
    setLoading(true);
    try { setData(await base44.functions.invoke('getDocumentVault', {})); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const onFile = async (docId, file) => {
    if (!file) return;
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      await base44.functions.invoke('uploadDocument', { organisation_id: docId ? undefined : undefined, document_id: docId, title: 'version', category: 'bas', file_url: up.file_url });
      load();
    } catch (e) { alert(e.message); }
  };

  const uploadNew = async () => {
    if (!form.title || !form.file_url) return;
    try {
      await base44.functions.invoke('uploadDocument', { ...form });
      setForm({ title: '', category: 'bas', file_url: '', expiry_date: '', notes: '' });
      setShowForm(false);
      load();
    } catch (e) { alert(e.message); }
  };
  const uploadVersion = async (doc) => {
    const url = versionUrl[doc.id];
    if (!url) return;
    try {
      await base44.functions.invoke('uploadDocument', { document_id: doc.id, title: doc.title, category: doc.category, file_url: url });
      setVersionUrl({ ...versionUrl, [doc.id]: '' });
      load();
    } catch (e) { alert(e.message); }
  };

  const docs = data?.documents || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"><FolderLock className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Document Vault</h1>
            <p className="text-xs text-zinc-500">Secure storage with version history · {docs.length} document(s)</p>
          </div>
          <Link to="/" className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300">Dashboard</Link>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-300 hover:text-amber-300 flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          <button onClick={() => setShowForm((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1"><Upload className="w-3 h-3" /> Upload</button>
        </div>

        {showForm && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 mb-5 grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm w-full" /></Field>
            <Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm">{CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select></Field>
            <Field label="File URL"><input value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://…" className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm w-full" /></Field>
            <Field label="Expiry date"><input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm w-full" /></Field>
            <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm w-full" /></Field>
            <div className="flex items-end"><button onClick={uploadNew} className="text-sm px-4 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">Upload</button></div>
          </div>
        )}

        {loading ? <Spinner /> : docs.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
            <FolderLock className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-400">No documents yet. Upload a BAS, tax return, insurance, lease or policy.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40">
                <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="w-full flex items-center gap-3 p-3 text-left">
                  <ChevronRight className={`w-4 h-4 text-zinc-500 transition-transform ${expanded === d.id ? 'rotate-90' : ''}`} />
                  <span className="text-sm font-medium text-zinc-200">{d.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{CAT_LABEL[d.category] || d.category}</span>
                  <span className="text-xs text-zinc-600">v{d.current_version}</span>
                  {d.expiry_date && <span className="text-xs text-zinc-500">expires {d.expiry_date}</span>}
                  <span className="ml-auto text-xs text-zinc-500">{d.versions?.length || 0} version(s)</span>
                </button>
                {expanded === d.id && (
                  <div className="px-4 pb-4 border-t border-zinc-800/60 pt-3">
                    <div className="flex items-center gap-2 mb-3">
                      <input value={versionUrl[d.id] || ''} onChange={(e) => setVersionUrl({ ...versionUrl, [d.id]: e.target.value })} placeholder="New version file URL" className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm" />
                      <button onClick={() => uploadVersion(d)} className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-300">Add version</button>
                    </div>
                    <ul className="space-y-1">
                      {(d.versions || []).map((v) => <li key={v.id} className="flex items-center justify-between text-xs text-zinc-400">
                        <span>v{v.version} · {v.uploaded_at?.slice(0, 10)} · {v.file_size || 0} bytes</span>
                        <a href={v.file_url} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">open</a>
                      </li>)}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function Field({ label, children }) { return <div><label className="text-xs text-zinc-500 block mb-1">{label}</label>{children}</div>; }
function Spinner() { return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-zinc-800 border-t-amber-500 rounded-full animate-spin" /></div>; }