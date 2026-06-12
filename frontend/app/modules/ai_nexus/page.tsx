'use client'

/**
 * AI Nexus module — hybrid AI assistant for clinical interpretation.
 *
 * Consumes (note router prefix is /ai, not /ai_nexus):
 *   GET  /api/v1/ai/status
 *   POST /api/v1/ai/interpret      — single-result clinical interpretation
 *   POST /api/v1/ai/flag-check     — deterministic offline panic check
 *   POST /api/v1/ai/sepsis-screen  — qSOFA / SIRS / sepsis risk
 *   POST /api/v1/ai/drug-interaction
 *
 * Three tools in tabs. Rules engine always works offline; LLM enrichment
 * uses local Ollama or cloud Claude when reachable (status panel shows
 * which is up).
 */

import { useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface SystemStatus {
  offline_capable: boolean
  rules_engine: { available: boolean }
  local_llm:    { available: boolean; model?: string }
  cloud_llm:    { available: boolean; model?: string }
  recommended_layer?: string
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(extra?: HeadersInit): HeadersInit {
  const t = getToken()
  return { ...(extra || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

type Tool = 'interpret' | 'flag' | 'sepsis' | 'drug'

export default function AiNexusPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="AI Nexus" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [tool,   setTool]   = useState<Tool>('interpret')

  useEffect(() => {
    fetch(`${API}/api/v1/ai/status`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(setStatus).catch(() => {})
  }, [])

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(56,189,248,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(56,189,248,0.06) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-sky-200" style={{ textShadow: '0 0 20px rgba(56,189,248,0.30)' }}>
                🤖 {t('mod.ai')}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {t('mod.ai.sub')}
              </p>
            </div>
            {status && (
              <div className="flex items-center gap-2 text-xs">
                <Health on={status.rules_engine.available} label={t('ai.health.rules')} />
                <Health on={status.local_llm.available}    label={`${t('ai.health.local')}${status.local_llm.model ? ` (${status.local_llm.model})` : ''}`} />
                <Health on={status.cloud_llm.available}    label={`${t('ai.health.cloud')}${status.cloud_llm.model ? ` (${status.cloud_llm.model})` : ''}`} />
              </div>
            )}
          </div>
          <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-700/60 -mb-px">
            {([
              ['interpret', t('ai.tab.interpret'), '🧪'],
              ['flag',      t('ai.tab.flag'),      '⚠️'],
              ['sepsis',    t('ai.tab.sepsis'),    '🩺'],
              ['drug',      t('ai.tab.drug'),      '💊'],
            ] as const).map(([k, l, i]) => {
              const on = tool === k
              return (
                <button key={k} onClick={() => setTool(k as Tool)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-2
                    ${on ? 'text-sky-300 border-sky-400 bg-slate-900/60' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
                  <span>{i}</span>{l}
                </button>
              )
            })}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-5">
        {tool === 'interpret' && <InterpretTool />}
        {tool === 'flag'      && <FlagTool />}
        {tool === 'sepsis'    && <SepsisTool />}
        {tool === 'drug'      && <DrugTool />}
      </div>
    </>
  )
}

// ── Tools ───────────────────────────────────────────────────────────────────

function InterpretTool() {
  const t = useT()
  const [form, setForm] = useState({
    test_code: 'HGB', test_name: 'Haemoglobin', value: '6.2',
    unit: 'g/dL', flag: 'LL', ref_range: '12–16',
    patient_sex: 'F', patient_age: 32,
  })
  return (
    <ToolForm
      endpoint="/api/v1/ai/interpret"
      payload={form}
      title={t('ai.interpret.title')}
      desc={t('ai.interpret.desc')}
      render={() => (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('ai.f.test_code')}><Input value={form.test_code} onChange={v => setForm({...form, test_code: v})} /></Field>
          <Field label={t('ai.f.test_name')}><Input value={form.test_name} onChange={v => setForm({...form, test_name: v})} /></Field>
          <Field label={t('ai.f.value')}><Input value={form.value} onChange={v => setForm({...form, value: v})} /></Field>
          <Field label={t('ai.f.unit')}><Input value={form.unit} onChange={v => setForm({...form, unit: v})} /></Field>
          <Field label={t('ai.f.flag')}>
            <select value={form.flag} onChange={e => setForm({...form, flag: e.target.value})}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full">
              {['N','H','L','HH','LL'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label={t('ai.f.ref_range')}><Input value={form.ref_range} onChange={v => setForm({...form, ref_range: v})} /></Field>
          <Field label={t('ai.f.sex')}>
            <select value={form.patient_sex} onChange={e => setForm({...form, patient_sex: e.target.value})}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full">
              <option value="">—</option><option value="M">M</option><option value="F">F</option>
            </select>
          </Field>
          <Field label={t('ai.f.age')}><Input value={String(form.patient_age)} onChange={v => setForm({...form, patient_age: Number(v) || 0})} /></Field>
        </div>
      )}
    />
  )
}

function FlagTool() {
  const t = useT()
  const [form, setForm] = useState({ test_code: 'K', value: 6.8, unit: 'mmol/L', flag: '', sex: '', age: 0 })
  return (
    <ToolForm
      endpoint="/api/v1/ai/flag-check"
      payload={form}
      title={t('ai.flag.title')}
      desc={t('ai.flag.desc')}
      render={() => (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('ai.f.test_code')}><Input value={form.test_code} onChange={v => setForm({...form, test_code: v})} /></Field>
          <Field label={t('ai.f.value')}><Input type="number" value={String(form.value)} onChange={v => setForm({...form, value: Number(v) || 0})} /></Field>
          <Field label={t('ai.f.unit')}><Input value={form.unit} onChange={v => setForm({...form, unit: v})} /></Field>
          <Field label={t('ai.f.sex')}>
            <select value={form.sex} onChange={e => setForm({...form, sex: e.target.value})}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full">
              <option value="">—</option><option value="M">M</option><option value="F">F</option>
            </select>
          </Field>
        </div>
      )}
    />
  )
}

function SepsisTool() {
  const t = useT()
  const [form, setForm] = useState({ wbc: 18.5, temp_c: 39.2, hr: 124, rr: 26, crp: 220, lactate: 4.1, culture_positive: false })
  return (
    <ToolForm
      endpoint="/api/v1/ai/sepsis-screen"
      payload={form}
      title={t('ai.sepsis.title')}
      desc={t('ai.sepsis.desc')}
      render={() => (
        <div className="grid grid-cols-2 gap-3">
          {(['wbc','temp_c','hr','rr','crp','lactate'] as const).map(k => (
            <Field key={k} label={k.toUpperCase()}>
              <Input type="number" value={String((form as any)[k] ?? '')}
                onChange={v => setForm({...form, [k]: v === '' ? undefined : Number(v)})} />
            </Field>
          ))}
          <Field label={t('ai.f.culture_pos')} full>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={form.culture_positive}
                onChange={e => setForm({...form, culture_positive: e.target.checked})} />
              {t('ai.f.culture_pos_lbl')}
            </label>
          </Field>
        </div>
      )}
    />
  )
}

function DrugTool() {
  const t = useT()
  const [meds, setMeds] = useState('Warfarin, Aspirin')
  const [proposed, setProposed] = useState('Ibuprofen')
  const form = {
    current_medications: meds.split(',').map(s => s.trim()).filter(Boolean),
    proposed_medication: proposed,
    context: '',
  }
  return (
    <ToolForm
      endpoint="/api/v1/ai/drug-interaction"
      payload={form}
      title={t('ai.drug.title')}
      desc={t('ai.drug.desc')}
      render={() => (
        <div className="space-y-3">
          <Field label={t('ai.f.current_meds')}>
            <Input value={meds} onChange={setMeds} />
          </Field>
          <Field label={t('ai.f.proposed_med')}>
            <Input value={proposed} onChange={setProposed} />
          </Field>
        </div>
      )}
    />
  )
}

// ── Shared tool form ────────────────────────────────────────────────────────

function ToolForm({
  endpoint, payload, title, desc, render,
}: {
  endpoint: string; payload: any; title: string; desc: string;
  render: () => React.ReactNode
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [out,  setOut]  = useState<any>(null)
  const [err,  setErr]  = useState<string | null>(null)

  async function submit() {
    setBusy(true); setErr(null); setOut(null)
    try {
      const r = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error(await r.text())
      setOut(await r.json())
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <section className="rounded-xl border border-sky-400/30 bg-slate-900/60 backdrop-blur p-5"
             style={{ boxShadow: '0 0 20px rgba(56,189,248,0.08)' }}>
      <h2 className="text-lg font-bold text-sky-200">{title}</h2>
      <p className="text-xs text-slate-400 mb-4">{desc}</p>
      {render()}
      {err && <div className="mt-3 text-xs text-rose-300">⚠ {err}</div>}
      <div className="mt-4 flex justify-end">
        <button onClick={submit} disabled={busy}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50">
          {busy ? t('ai.thinking') : t('ai.run')}
        </button>
      </div>
      {out && (
        <div className="mt-4 rounded-lg border border-slate-700/60 bg-slate-800/40 p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-sky-300 mb-2">{t('ai.response')}</div>
          <div className="max-h-[28rem] overflow-y-auto pr-1">
            <ReadableResult value={out} />
          </div>
        </div>
      )}
    </section>
  )
}

// ── Bits ────────────────────────────────────────────────────────────────────

function Health({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] uppercase font-semibold tracking-wider border
      ${on ? 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30' : 'text-slate-500 bg-slate-800/50 border-slate-600'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
      {label}
    </span>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">{label}</div>
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text' }:
  { value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full focus:ring-2 focus:ring-sky-400 outline-none" />
  )
}

// ── Readable AI result renderer ───────────────────────────────────────────────
// Turns the structured AI/rules-engine JSON into labelled sections, bullet
// lists and colour-coded badges instead of a raw dump — so the output reads
// like a clinical summary.

function humanizeKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
}

const TONE_MAP = {
  rose:    'text-rose-300 bg-rose-500/15 border-rose-400/30',
  amber:   'text-amber-300 bg-amber-500/15 border-amber-400/30',
  emerald: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30',
} as const

function Badge({ text, tone }: { text: string; tone: keyof typeof TONE_MAP }) {
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${TONE_MAP[tone]}`}>{text}</span>
}

function toneFor(s: string): keyof typeof TONE_MAP | null {
  const up = s.toUpperCase()
  if (/CRITICAL|IMMEDIATE|PANIC|SEVERE|REACTIVE|POSITIVE|HIGH RISK|URGENT NOTIFY/.test(up)) return 'rose'
  if (/URGENT|WARNING|MODERATE|ABNORMAL|BORDERLINE|MANDATORY/.test(up)) return 'amber'
  if (/NORMAL|LOW RISK|NEGATIVE|NON-REACTIVE|STABLE|ROUTINE|PASS/.test(up)) return 'emerald'
  return null
}

function ReadableResult({ value, depth = 0 }: { value: any; depth?: number }): React.ReactElement {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-500">—</span>
  }
  if (typeof value === 'boolean') {
    return <Badge text={value ? 'Yes' : 'No'} tone={value ? 'amber' : 'emerald'} />
  }
  if (typeof value === 'number') {
    return <span className="text-slate-100 font-semibold">{value}</span>
  }
  if (typeof value === 'string') {
    const tone = toneFor(value)
    if (tone && value.length <= 48) return <Badge text={value} tone={tone} />
    return <span className="text-slate-200 whitespace-pre-wrap">{value}</span>
  }
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-slate-500">—</span>
    return (
      <ul className="list-disc list-inside space-y-1 marker:text-slate-600">
        {value.map((v, i) => (
          <li key={i} className="text-slate-200">
            {typeof v === 'object' && v
              ? <span className="inline-block align-top ml-1"><ReadableResult value={v} depth={depth + 1} /></span>
              : <ReadableResult value={v} depth={depth + 1} />}
          </li>
        ))}
      </ul>
    )
  }
  // object
  const entries = Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (!entries.length) return <span className="text-slate-500">—</span>
  return (
    <div className={depth > 0 ? 'pl-3 border-l border-slate-700/60 space-y-1.5' : 'space-y-2.5'}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-sky-300/80">{humanizeKey(k)}</div>
          <div className="text-sm mt-0.5"><ReadableResult value={v} depth={depth + 1} /></div>
        </div>
      ))}
    </div>
  )
}
