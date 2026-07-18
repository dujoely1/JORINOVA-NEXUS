'use client'

/**
 * SOP Library — upload Standard Operating Procedures. The backend extracts the
 * text and COMPRESSES it (gzip); the AI then uses it as module knowledge
 * (principles / procedures / interpretation). Backend: /api/v1/ai/sop.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
function tok(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token')
}
function H(json = false): HeadersInit {
  const t = tok(); return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const MODULES = ['', 'hematology', 'coagulation', 'biochemistry', 'serology', 'hormones', 'tumor_markers',
  'microbiology', 'parasitology', 'mycology', 'histology', 'cytology', 'blood_bank', 'molecular', 'quality']

interface Sop { id: number; title: string; module: string | null; filename: string | null; chars: number; summary: string | null; created_at: string | null }

export default function SopPage() {
  return <RequireAuth><AppShell pageTag="SOP Library" theme="dark"><Inner /></AppShell></RequireAuth>
}

function Inner() {
  const [rows, setRows] = useState<Sop[]>([])
  const [title, setTitle] = useState('')
  const [module, setModule] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [view, setView] = useState<{ title: string; content: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try { const r = await fetch(`${API}/api/v1/ai/sop`, { headers: H() }); if (r.ok) setRows(await r.json()) } catch { /* ignore */ }
  }, [])
  useEffect(() => { void load() }, [load])

  async function upload() {
    if (!file) { setMsg('Choose a file first'); return }
    setBusy(true); setMsg('Uploading + compressing…')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', title.trim() || file.name)
      fd.append('module', module)
      const r = await fetch(`${API}/api/v1/ai/sop`, { method: 'POST', headers: H(), body: fd })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || `HTTP ${r.status}`) }
      const j = await r.json()
      setMsg(`✅ Saved “${j.title}” — ${j.chars} chars, stored at ${j.stored_pct}% (compressed)`)
      setTitle(''); setFile(null); if (inputRef.current) inputRef.current.value = ''
      await load()
    } catch (e: any) { setMsg('⚠ ' + (e.message || String(e))) } finally { setBusy(false) }
  }

  async function open(id: number) {
    try { const r = await fetch(`${API}/api/v1/ai/sop/${id}`, { headers: H() }); if (r.ok) { const j = await r.json(); setView({ title: j.title, content: j.content }) } } catch { /* ignore */ }
  }
  async function del(id: number) {
    if (!confirm('Delete this SOP?')) return
    try { const r = await fetch(`${API}/api/v1/ai/sop/${id}`, { method: 'DELETE', headers: H() }); if (r.ok) await load(); else setMsg('⚠ delete failed (admin/quality only)') } catch { /* ignore */ }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-indigo-200">📄 SOP Library</h1>
        <p className="text-xs text-slate-400 mt-1">Upload SOPs (PDF / text). The system compresses them and the AI uses them as module knowledge for interpretation.</p>
      </div>

      {/* Upload */}
      <div className="rounded-xl border border-indigo-400/30 bg-slate-900/60 p-4 grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input placeholder="Title (e.g. Gram stain SOP)" value={title} onChange={e => setTitle(e.target.value)} className="sm:col-span-2 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100" />
        <select value={module} onChange={e => setModule(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100">
          {MODULES.map(m => <option key={m} value={m}>{m || 'module…'}</option>)}
        </select>
        <input ref={inputRef} type="file" accept=".pdf,.txt,.md,.csv" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-slate-100" />
        <button onClick={upload} disabled={busy} className="sm:col-span-4 sm:w-auto sm:justify-self-start px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">
          {busy ? '…' : '⬆ Upload SOP'}
        </button>
      </div>
      {msg && <div className="text-xs text-slate-300">{msg}</div>}

      {/* List */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
            <th className="px-3 py-2">Title</th><th className="px-3 py-2">Module</th><th className="px-3 py-2">Size</th><th className="px-3 py-2">Summary</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} className="border-b border-slate-800/60">
                <td className="px-3 py-2 text-slate-100 font-semibold">{s.title}</td>
                <td className="px-3 py-2 text-slate-300 text-xs">{s.module ?? '—'}</td>
                <td className="px-3 py-2 text-slate-400 text-xs">{s.chars} ch</td>
                <td className="px-3 py-2 text-slate-400 text-xs max-w-sm truncate" title={s.summary ?? ''}>{s.summary ?? '—'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => open(s.id)} className="text-sky-300 hover:underline text-xs mr-2">view</button>
                  <button onClick={() => del(s.id)} className="text-rose-300 hover:underline text-xs">delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500 text-xs">No SOPs uploaded yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {view && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setView(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-2xl max-h-[80vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-slate-100">{view.title}</div>
              <button onClick={() => setView(null)} className="text-slate-400 hover:text-slate-100">✕</button>
            </div>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans">{view.content}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
