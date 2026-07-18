'use client'

/**
 * AI Interpretation — module-aware. Enter results for any discipline and get
 * deterministic flags + pattern impressions + an AI narrative that also draws on
 * the staining/preservation KB and uploaded SOPs. Backend: POST /ai/interpret/module.
 */
import { useState } from 'react'
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

const MODULES = ['hematology', 'coagulation', 'biochemistry', 'serology', 'hormones', 'tumor_markers',
  'urinalysis', 'microbiology', 'parasitology', 'mycology', 'histology', 'cytology', 'toxicology', 'blood_gas']

type Row = { test: string; value: string; unit: string }
const FLAG_CLS: Record<string, string> = {
  'CRITICAL HIGH': 'text-rose-200 bg-rose-500/20', 'CRITICAL LOW': 'text-rose-200 bg-rose-500/20',
  'HIGH': 'text-amber-200 bg-amber-500/20', 'LOW': 'text-amber-200 bg-amber-500/20',
  'NORMAL': 'text-emerald-200 bg-emerald-500/15', 'UNKNOWN': 'text-slate-300 bg-slate-700/50',
}

export default function InterpretPage() {
  return <RequireAuth><AppShell pageTag="AI Interpretation" theme="dark"><Inner /></AppShell></RequireAuth>
}

function Inner() {
  const [module, setModule] = useState('biochemistry')
  const [sex, setSex] = useState('')
  const [age, setAge] = useState('')
  const [context, setContext] = useState('')
  const [rows, setRows] = useState<Row[]>([{ test: '', value: '', unit: '' }])
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  const setRow = (i: number, k: keyof Row, v: string) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const addRow = () => setRows(rs => [...rs, { test: '', value: '', unit: '' }])
  const delRow = (i: number) => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)

  async function run() {
    const results = rows.filter(r => r.test.trim()).map(r => ({ test: r.test.trim(), value: r.value, unit: r.unit.trim() }))
    if (!results.length) { setErr('Add at least one result (test + value)'); return }
    setBusy(true); setErr(null); setRes(null)
    try {
      const r = await fetch(`${API}/api/v1/ai/interpret/module`, {
        method: 'POST', headers: H(true),
        body: JSON.stringify({ module, results, sex, age: parseInt(age) || 0, context }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || `HTTP ${r.status}`) }
      setRes(await r.json())
    } catch (e: any) { setErr(e.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-cyan-200">🧠 AI Interpretation</h1>
        <p className="text-xs text-slate-400 mt-1">Any module — deterministic flags + AI narrative (uses staining/preservation rules + your SOPs). Decision support; a scientist validates.</p>
      </div>

      {/* Inputs */}
      <div className="rounded-xl border border-cyan-400/30 bg-slate-900/60 p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={module} onChange={e => setModule(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100">
            {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={sex} onChange={e => setSex(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100">
            <option value="">Sex…</option><option value="M">Male</option><option value="F">Female</option>
          </select>
          <input placeholder="Age" value={age} onChange={e => setAge(e.target.value.replace(/\D/g, ''))} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100" />
          <button onClick={addRow} className="rounded bg-slate-700 text-slate-100 text-sm font-semibold hover:bg-slate-600">+ Add result</button>
        </div>

        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_90px_32px] gap-2">
              <input placeholder="Test (e.g. tsh, potassium, ca_125)" value={r.test} onChange={e => setRow(i, 'test', e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100" />
              <input placeholder="Value" value={r.value} onChange={e => setRow(i, 'value', e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100" />
              <input placeholder="Unit" value={r.unit} onChange={e => setRow(i, 'unit', e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100" />
              <button onClick={() => delRow(i)} className="text-slate-500 hover:text-rose-300" title="Remove">✕</button>
            </div>
          ))}
        </div>

        <textarea placeholder="Clinical context (optional)" value={context} onChange={e => setContext(e.target.value)} rows={2} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100" />
        <button onClick={run} disabled={busy} className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-500 disabled:opacity-50">
          {busy ? 'Interpreting…' : '🧠 Interpret'}
        </button>
        {err && <div className="text-xs text-rose-300">⚠ {err}</div>}
      </div>

      {/* Results */}
      {res && (
        <div className="space-y-4">
          {res.critical?.length > 0 && (
            <div className="rounded-lg bg-rose-900/40 border border-rose-600/60 px-3 py-2 text-sm text-rose-100">
              🚨 CRITICAL: {res.critical.join(' · ')} — notify the clinician.
            </div>
          )}

          <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
                <th className="px-3 py-2">Test</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Flag</th><th className="px-3 py-2">Reference</th>
              </tr></thead>
              <tbody>
                {res.results?.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-slate-800/60">
                    <td className="px-3 py-2 text-slate-100 font-semibold">{r.test}</td>
                    <td className="px-3 py-2 text-slate-300">{r.value} {r.unit}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${FLAG_CLS[r.flag] ?? 'bg-slate-700 text-slate-300'}`}>{r.flag}</span></td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{r.reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {res.impressions?.length > 0 && (
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Pattern impressions</div>
              <ul className="list-disc list-inside text-sm text-slate-200 space-y-0.5">
                {res.impressions.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {res.ai?.narrative && (
            <div className="rounded-xl border border-cyan-400/30 bg-slate-900/60 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs uppercase tracking-wider text-cyan-300">AI interpretation</span>
                {res.ai.layer && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{res.ai.offline ? '🔌 offline' : ''} {res.ai.layer}</span>}
              </div>
              <div className="text-sm text-slate-200 whitespace-pre-wrap">{res.ai.narrative}</div>
            </div>
          )}

          {(res.knowledge_used?.length > 0 || res.sop_used?.length > 0) && (
            <div className="text-[11px] text-slate-500 flex flex-wrap gap-1.5">
              {res.knowledge_used?.map((k: string, i: number) => <span key={'k' + i} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">📚 {k}</span>)}
              {res.sop_used?.map((k: string, i: number) => <span key={'s' + i} className="px-1.5 py-0.5 rounded bg-indigo-900/40 border border-indigo-700/50 text-indigo-200">📄 {k}</span>)}
            </div>
          )}
          <div className="text-[11px] text-slate-500">⚠ Decision support only — a qualified scientist validates every result.</div>
        </div>
      )}
    </div>
  )
}
