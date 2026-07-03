'use client'

/**
 * QuickPatientBar — the fast-path patient workspace that lives in the centre
 * of the dashboard (in place of the old logo) and behind the 🔍 button of the
 * global ModuleToolbar, so it is reachable from every working area.
 *
 * The operator types a name / PID / LID / SID, picks a patient, and gets a
 * single horizontal strip carrying every identity + request field, plus a row
 * of one-tap actions (receive test, send report, filter, print, notification,
 * warning, result/label) — without having to open the Patients module or the
 * Lab Hub first.
 *
 *   search  →  GET /api/v1/patients/?search=
 *   context →  GET /api/v1/worklist/all?patient_id=   (SID, tests, status …)
 *   receive →  PUT /api/v1/worklist/entry/{id}/status
 *
 * Everything degrades gracefully: if the backend is unreachable the strip
 * still renders and the action shows a toast instead of crashing.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import LabelModal from './LabelModal'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const BLUE = '#0066CC'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(json = false): HeadersInit {
  const tok = getToken()
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
  }
}

interface Patient {
  id: number; pid: string; unique_lab_id: string | null
  full_name: string; family_name: string; other_names: string | null
  date_of_birth: string | null; age: number | null
  gender: string | null; blood_group: string | null; address?: string | null
}
interface Entry {
  id: number; sid: string | null; department: string | null
  status: string | null; priority: string | null
  test_names?: unknown; is_high_risk?: boolean; ward?: string | null
}

function testNamesOf(entries: Entry[]): string[] {
  const out: string[] = []
  for (const e of entries) {
    const tn = e.test_names
    if (Array.isArray(tn)) tn.forEach(x => out.push(String(x)))
    else if (typeof tn === 'string' && tn.trim()) tn.split(',').forEach(x => out.push(x.trim()))
  }
  return Array.from(new Set(out.filter(Boolean)))
}

export default function QuickPatientBar({ onClose }: { onClose?: () => void }) {
  const router = useRouter()
  const [q, setQ]             = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [openList, setOpenList] = useState(false)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [filter, setFilter]   = useState('')
  const [showWarn, setShowWarn] = useState(false)
  const [showLabel, setShowLabel] = useState(false)
  const [toast, setToast]     = useState<string | null>(null)
  const debounce = useRef<number | undefined>(undefined)

  // ── Debounced patient search ────────────────────────────────────────────
  useEffect(() => {
    if (!q.trim() || (patient && q === (patient.full_name ?? patient.family_name))) {
      setResults([]); setOpenList(false); return
    }
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/v1/patients/?search=${encodeURIComponent(q.trim())}&limit=8`,
          { headers: authHeaders() })
        const data = r.ok ? await r.json() : []
        setResults(Array.isArray(data) ? data : [])
        setOpenList(true)
      } catch { setResults([]) }
    }, 250)
    return () => window.clearTimeout(debounce.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  async function selectPatient(p: Patient) {
    setPatient(p)
    setOpenList(false)
    setQ(p.full_name ?? p.family_name)
    setEntries([])
    setShowWarn(false)
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/v1/worklist/all?patient_id=${p.id}&limit=50`, { headers: authHeaders() })
      const data = r.ok ? await r.json() : []
      setEntries(Array.isArray(data) ? data : [])
    } catch { setEntries([]) } finally { setLoading(false) }
  }

  const latest   = entries[0]
  const sid      = latest?.sid ?? '—'
  const ward     = latest?.ward ?? '—'
  const allTests = testNamesOf(entries)
  const tests    = filter ? allTests.filter(t => t.toLowerCase().includes(filter.toLowerCase())) : allTests
  const warnings = entries.filter(e =>
    (e.priority && e.priority.toLowerCase() === 'stat') || e.is_high_risk || e.status === 'REJECTED')

  // ── Actions ─────────────────────────────────────────────────────────────
  async function receiveTest() {
    if (!latest) { flash('No worklist entry to receive'); return }
    try {
      const r = await fetch(`${API}/api/v1/worklist/entry/${latest.id}/status`, {
        method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ status: 'RECEIVED' }),
      })
      if (r.ok) { flash(`✅ Sample ${sid} received`); if (patient) selectPatient(patient) }
      else { const b = await r.json().catch(() => ({})); flash(`⚠ ${b.detail ?? 'Could not receive (check status)'}`) }
    } catch { flash('⚠ Backend not reachable') }
  }
  function sendReport() {
    if (!patient) return
    router.push(`/modules/register?pid=${encodeURIComponent(patient.pid)}`)
  }
  function openNotifications() { router.push('/modules/notifications') }
  function printCard() { if (typeof window !== 'undefined') window.print() }

  const disabled = !patient

  return (
    <section
      className="rounded-2xl border bg-slate-900/70 backdrop-blur p-4 sm:p-5 shadow-lg print:bg-white"
      style={{ borderColor: 'rgba(56,189,248,0.35)', boxShadow: '0 0 26px rgba(56,189,248,0.10)' }}
    >
      {/* header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold tracking-wide text-sky-300 flex items-center gap-2">
          <span className="text-lg">⚡</span> Quick patient workspace
        </h2>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-lg leading-none px-2">✕</button>
        )}
      </div>

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-600 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-sky-400">
          <span className="text-slate-400">🔍</span>
          <input
            value={q}
            onChange={e => { setQ(e.target.value); if (patient) setPatient(null) }}
            onFocus={() => results.length && setOpenList(true)}
            onKeyDown={e => { if (e.key === 'Enter' && results[0]) selectPatient(results[0]) }}
            placeholder="Search patient — name, PID, LID or SID…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
            autoComplete="off"
          />
          {q && <button onClick={() => { setQ(''); setPatient(null); setEntries([]) }}
                        className="text-slate-500 hover:text-slate-200 text-sm">clear</button>}
        </div>

        {openList && results.length > 0 && (
          <ul className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 shadow-2xl">
            {results.map(p => (
              <li key={p.id}>
                <button onClick={() => selectPatient(p)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-800 border-b last:border-0 border-slate-700/50">
                  <div className="text-sm font-semibold text-slate-100">{p.full_name || `${p.family_name} ${p.other_names ?? ''}`}</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {p.pid}{p.unique_lab_id ? ` · ${p.unique_lab_id}` : ''}{p.age != null ? ` · ${p.age}y` : ''}{p.gender ? ` · ${p.gender}` : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {openList && q.trim() && results.length === 0 && (
          <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-400">
            No patient found for “{q}”.
          </div>
        )}
      </div>

      {/* ── Horizontal identity + request strip ────────────────────────── */}
      <div className="mt-4 overflow-x-auto">
        <div className="flex items-stretch gap-2 min-w-max">
          <Field label="Patient name" value={patient ? (patient.full_name || `${patient.family_name} ${patient.other_names ?? ''}`) : '—'} wide />
          <Field label="PID"      value={patient?.pid ?? '—'} mono />
          <Field label="LID"      value={patient?.unique_lab_id ?? '—'} mono />
          <Field label="SID"      value={sid} mono />
          <Field label="Ward"     value={ward} />
          <Field label="Age"      value={patient?.age != null ? `${patient.age}` : '—'} />
          <Field label="DOB"      value={patient?.date_of_birth ?? '—'} />
          <Field label="District" value={patient?.address ?? '—'} />
          <Field label="Tests requested" value={loading ? '…' : (allTests.length ? `${allTests.length} test(s)` : '—')} wide />
        </div>
      </div>

      {/* tests as chips (optionally filtered) */}
      {(allTests.length > 0) && (
        <div className="mt-2">
          {showFilter && (
            <input value={filter} onChange={e => setFilter(e.target.value)}
                   placeholder="Filter tests…"
                   className="mb-2 w-full sm:w-64 bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-sky-400" />
          )}
          <div className="flex flex-wrap gap-1.5">
            {tests.map((tn, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-200 border border-sky-400/30">{tn}</span>
            ))}
            {tests.length === 0 && <span className="text-[11px] text-slate-500">No tests match “{filter}”.</span>}
          </div>
        </div>
      )}

      {/* ── Warning panel ──────────────────────────────────────────────── */}
      {showWarn && (
        <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3">
          <div className="text-xs font-bold text-rose-200 mb-1">⚠ Warnings</div>
          {warnings.length === 0
            ? <div className="text-[11px] text-slate-300">No STAT / critical / rejected flags for this patient.</div>
            : <ul className="space-y-1">
                {warnings.map(w => (
                  <li key={w.id} className="text-[11px] text-rose-100 font-mono">
                    {w.sid ?? '—'} · {w.department ?? '—'} · {(w.priority ?? '').toUpperCase()} · {w.status}
                    {w.is_high_risk ? ' · HIGH-RISK' : ''}
                  </li>
                ))}
              </ul>}
        </div>
      )}

      {/* ── Action row ─────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Action icon="📥" label="Receive test"   onClick={receiveTest}                 disabled={disabled} tone={BLUE} />
        <Action icon="📤" label="Send report"    onClick={sendReport}                  disabled={disabled} tone="#0F766E" />
        <Action icon="⚙️" label="Filter"         onClick={() => setShowFilter(v => !v)} disabled={disabled} tone="#475569" active={showFilter} />
        <Action icon="🖨️" label="Print"          onClick={printCard}                   disabled={disabled} tone="#475569" />
        <Action icon="🔔" label="Notification"   onClick={openNotifications}           tone="#B45309" />
        <Action icon="⚠️" label="Warning"        onClick={() => setShowWarn(v => !v)}   disabled={disabled} tone="#B91C1C" active={showWarn}
                badge={warnings.length || undefined} />
        <Action icon="🏷️" label="Result / label" onClick={() => setShowLabel(true)}    disabled={disabled} tone="#A6800F" />
      </div>

      {toast && (
        <div className="mt-3 text-xs px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100">{toast}</div>
      )}

      {showLabel && <LabelModal onClose={() => setShowLabel(false)} />}
    </section>
  )
}

// ── bits ────────────────────────────────────────────────────────────────────
function Field({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-slate-700/70 bg-slate-800/50 px-3 py-2 ${wide ? 'min-w-[180px]' : 'min-w-[104px]'}`}>
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-sm text-slate-100 truncate ${mono ? 'font-mono' : ''}`} title={value}>{value}</div>
    </div>
  )
}

function Action({
  icon, label, onClick, disabled, tone, active, badge,
}: { icon: string; label: string; onClick: () => void; disabled?: boolean; tone: string; active?: boolean; badge?: number }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-100 border transition-all hover:scale-[1.03] disabled:opacity-40 disabled:hover:scale-100"
      style={{
        background: active ? `${tone}33` : `${tone}1F`,
        borderColor: `${tone}80`,
      }}
    >
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
      {badge ? (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">{badge}</span>
      ) : null}
    </button>
  )
}
