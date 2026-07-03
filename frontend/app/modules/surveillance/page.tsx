'use client'

/** Surveillance module — outbreak signals + disease tracking + AMR. */
import { useCallback, useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL || ''
function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {} }

interface Signal { id: number; signal_id: string; signal_date?: string; department: string; disease?: string; case_count_7d: number; baseline_rate?: number; pct_increase?: number; alert_level: string; district?: string; resolved: boolean; recommended_action?: string }
interface Disease { id: number; track_date: string; disease: string; department: string; new_cases: number; total_cases: number; positive_rate?: number; district?: string }
interface FieldAct { id: number; staff: string; activity_type: string; title?: string; notes?: string; latitude?: number; longitude?: number; status: string; occurred_at?: string }

type Tab = 'signals' | 'burden' | 'tracking' | 'amr' | 'field'

async function opsPost(path: string, body?: unknown) {
  const t = getToken()
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  return r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
}

export default function SurveillancePage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Surveillance" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('signals')
  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(27,94,32,0.40)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(27,94,32,0.10) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-emerald-200" style={{ textShadow: '0 0 20px rgba(27,94,32,0.40)' }}>
            🔭 {t('mod.surveillance')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.surveillance.sub')}</p>
          <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-700/60 -mb-px">
            {([
              ['signals',  t('surv.tab.signals'),  '🚨'],
              ['burden',   'Facility burden',      '🏥'],
              ['tracking', t('surv.tab.tracking'), '📊'],
              ['amr',      t('surv.tab.amr'),      '🦠'],
              ['field',    t('surv.tab.field'),    '📍'],
            ] as const).map(([k, l, i]) => {
              const on = tab === k
              return (
                <button key={k} onClick={() => setTab(k as Tab)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-2
                    ${on ? 'text-emerald-300 border-emerald-400 bg-slate-900/60' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
                  <span>{i}</span>{l}
                </button>
              )
            })}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-5">
        {tab === 'signals'  && <SignalsTab />}
        {tab === 'burden'   && <BurdenTab />}
        {tab === 'tracking' && <TrackingTab />}
        {tab === 'amr'      && <AMRTab />}
        {tab === 'field'    && <FieldTab />}
      </div>
    </>
  )
}

function useList<T>(url: string) {
  const [rows, setRows] = useState<T[]>([])
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => {
    fetch(`${API}${url}`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(j => setRows(Array.isArray(j) ? j : (j.signals || j.items || j.tracking || [])))
      .catch(e => setErr(String(e.message || e)))
  }, [url])
  useEffect(load, [load])
  return { rows, err }
}

function SignalsTab() {
  const t = useT()
  const { rows, err } = useList<Signal>('/api/v1/surveillance/signals?limit=200')
  if (err) return <Err msg={err} />
  return (
    <div className="space-y-3">
      {rows.length === 0 && <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-10 text-center text-slate-400">{t('surv.no_signals')}</div>}
      {rows.map(s => {
        const color = s.alert_level === 'EMERGENCY' || s.alert_level === 'ALERT' ? 'rose' : s.alert_level === 'WARNING' ? 'amber' : 'sky'
        const map = { rose: 'border-rose-400/50 bg-rose-950/30', amber: 'border-amber-400/50 bg-amber-950/30', sky: 'border-sky-400/30 bg-slate-900/50' } as const
        return (
          <div key={s.id} className={`rounded-xl border p-4 ${map[color as keyof typeof map]}`}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  color === 'rose' ? 'bg-rose-500/20 text-rose-200 border border-rose-400/40 animate-pulse' :
                  color === 'amber' ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40' :
                  'bg-sky-500/20 text-sky-200 border border-sky-400/40'
                }`}>{s.alert_level}</span>
                <span className="font-mono text-xs text-slate-400">{s.signal_id}</span>
                {s.resolved && <span className="text-[10px] uppercase tracking-wider text-emerald-400">{t('surv.resolved')}</span>}
              </div>
              <div className="text-xs text-slate-500">{s.signal_date} · {s.district || '—'}</div>
            </div>
            <div className="text-lg font-bold text-slate-100">{s.disease || s.department}</div>
            <div className="grid grid-cols-3 gap-4 mt-2 text-xs">
              <div><div className="text-slate-500">{t('surv.cases_7d')}</div><div className="text-xl font-extrabold text-slate-100">{s.case_count_7d}</div></div>
              <div><div className="text-slate-500">{t('surv.baseline')}</div><div className="text-slate-300">{s.baseline_rate ?? '—'}</div></div>
              <div><div className="text-slate-500">{t('surv.pct_increase')}</div><div className={`text-xl font-bold ${s.pct_increase && s.pct_increase >= 100 ? 'text-rose-300' : 'text-amber-300'}`}>{s.pct_increase != null ? `${Math.round(s.pct_increase)}%` : '—'}</div></div>
            </div>
            {s.recommended_action && <div className="mt-2 text-xs text-slate-400 italic">→ {s.recommended_action}</div>}
            <SignalActions signal={s} />
          </div>
        )
      })}
    </div>
  )
}

function SignalActions({ signal }: { signal: Signal }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function rbc() {
    setBusy(true)
    try { const d = await opsPost(`/api/v1/ops/surveillance/${signal.id}/report-rbc`); setMsg(`✅ ${d.message}`) }
    catch { setMsg('⚠ failed') } finally { setBusy(false) }
  }
  async function warn() {
    const ward = window.prompt('Send critical warning to which ward?', 'Pediatrics')
    if (!ward) return
    setBusy(true)
    try { const d = await opsPost(`/api/v1/ops/surveillance/${signal.id}/warn-ward`, { ward }); setMsg(`✅ ${d.message}`) }
    catch { setMsg('⚠ failed') } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <button onClick={rbc} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-sky-400/50 bg-sky-500/15 text-sky-100 hover:bg-sky-500/30 disabled:opacity-50">🏛️ Send to RBC</button>
      <button onClick={warn} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-rose-400/50 bg-rose-500/15 text-rose-100 hover:bg-rose-500/30 disabled:opacity-50">⚠ Warn ward</button>
      {msg && <span className="text-[11px] text-slate-300">{msg}</span>}
    </div>
  )
}

function BurdenTab() {
  const [data, setData] = useState<{ by_department: { department: string; count: number }[]; total_today: number; active_clusters: number } | null>(null)
  const [alerts, setAlerts] = useState<{ id: number; disease?: string; district?: string; alert_level: string; case_count_7d: number }[]>([])
  useEffect(() => {
    fetch(`${API}/api/v1/ops/facility-burden`, { headers: authHeaders() }).then(r => r.ok ? r.json() : null).then(setData).catch(() => {})
    fetch(`${API}/api/v1/ops/surveillance/active-alerts`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then(setAlerts).catch(() => {})
  }, [])
  const max = Math.max(1, ...(data?.by_department.map(d => d.count) ?? [1]))
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi label="Tests in facility today" value={data?.total_today ?? '—'} accent="#10b981" />
        <Kpi label="Active outbreak clusters" value={data?.active_clusters ?? '—'} accent="#ef4444" />
        <Kpi label="Departments active" value={data?.by_department.length ?? '—'} accent="#0ea5e9" />
      </div>
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
        <h3 className="text-sm font-bold text-emerald-300 mb-3">🏥 Disease / workload burden by department (today)</h3>
        <div className="space-y-2">
          {(data?.by_department ?? []).map(d => (
            <div key={d.department} className="flex items-center gap-3">
              <div className="w-28 text-xs text-slate-300 capitalize truncate">{d.department}</div>
              <div className="flex-1 h-4 rounded bg-slate-800 overflow-hidden"><div className="h-full rounded bg-emerald-500/70" style={{ width: `${(d.count / max) * 100}%` }} /></div>
              <div className="w-10 text-right text-xs font-mono text-slate-200">{d.count}</div>
            </div>
          ))}
          {(!data || data.by_department.length === 0) && <div className="text-xs text-slate-500">No worklist activity recorded today.</div>}
        </div>
      </div>
      <div className="rounded-xl border border-rose-400/30 bg-slate-900/60 p-5">
        <h3 className="text-sm font-bold text-rose-300 mb-3">📍 Area outbreak clusters (common disease spiking in a zone)</h3>
        <div className="space-y-1.5">
          {alerts.map(a => (
            <div key={a.id} className="flex items-center justify-between text-xs border-b border-slate-800/60 py-1.5">
              <span className="text-slate-100">{a.disease ?? '—'} <span className="text-slate-400">· {a.district ?? '—'}</span></span>
              <span className="text-rose-200 font-semibold">{a.case_count_7d} cases · {a.alert_level}</span>
            </div>
          ))}
          {alerts.length === 0 && <div className="text-xs text-slate-500">No active area clusters.</div>}
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-xl bg-slate-900/60 p-4 border" style={{ borderColor: `${accent}55` }}>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>{label}</div>
      <div className="text-3xl font-extrabold text-slate-100 mt-1">{value}</div>
    </div>
  )
}

function TrackingTab() {
  const t = useT()
  const { rows, err } = useList<Disease>('/api/v1/surveillance/disease-tracking?limit=200')
  if (err) return <Err msg={err} />
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left px-3 py-2.5">{t('tbl.date')}</th>
              <th className="text-left px-3 py-2.5">{t('surv.h.disease')}</th>
              <th className="text-left px-3 py-2.5">{t('surv.h.dept')}</th>
              <th className="text-right px-3 py-2.5">{t('surv.h.new_cases')}</th>
              <th className="text-right px-3 py-2.5">{t('surv.h.total')}</th>
              <th className="text-right px-3 py-2.5">{t('surv.h.pct_positive')}</th>
              <th className="text-left px-3 py-2.5">{t('surv.h.district')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">{t('surv.empty_tracking')}</td></tr>}
            {rows.map(d => (
              <tr key={d.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                <td className="px-3 py-2 text-slate-400 text-xs font-mono">{d.track_date}</td>
                <td className="px-3 py-2 text-slate-200 font-semibold">{d.disease}</td>
                <td className="px-3 py-2 text-slate-400 text-xs">{d.department}</td>
                <td className="px-3 py-2 text-right text-slate-100 font-bold">{d.new_cases}</td>
                <td className="px-3 py-2 text-right text-slate-300">{d.total_cases}</td>
                <td className="px-3 py-2 text-right">{d.positive_rate != null ? `${d.positive_rate}%` : '—'}</td>
                <td className="px-3 py-2 text-slate-400 text-xs">{d.district || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FieldTab() {
  const t = useT()
  const { rows, err } = useList<FieldAct>('/api/v1/staff-mobile/field-activities?limit=200')
  if (err) return <Err msg={err} />
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left px-3 py-2.5">{t('surv.fld.staff')}</th>
              <th className="text-left px-3 py-2.5">{t('tbl.type')}</th>
              <th className="text-left px-3 py-2.5">{t('surv.fld.title')}</th>
              <th className="text-left px-3 py-2.5">{t('common.notes')}</th>
              <th className="text-left px-3 py-2.5">{t('surv.fld.gps')}</th>
              <th className="text-left px-3 py-2.5">{t('surv.fld.when')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">{t('surv.empty_field')}</td></tr>}
            {rows.map(f => (
              <tr key={f.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                <td className="px-3 py-2 text-slate-200">{f.staff}</td>
                <td className="px-3 py-2"><span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border text-emerald-300 bg-emerald-500/15 border-emerald-400/30">{f.activity_type}</span></td>
                <td className="px-3 py-2 text-slate-300">{f.title || '—'}</td>
                <td className="px-3 py-2 text-slate-400 text-xs max-w-xs truncate" title={f.notes || ''}>{f.notes || '—'}</td>
                <td className="px-3 py-2 text-xs">
                  {f.latitude != null && f.longitude != null
                    ? <a href={`https://www.google.com/maps?q=${f.latitude},${f.longitude}`} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">📍 {t('surv.fld.map')}</a>
                    : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-2 text-slate-500 text-xs">{f.occurred_at ? new Date(f.occurred_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AMRTab() {
  const t = useT()
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch(`${API}/api/v1/surveillance/amr-report`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setData).catch(e => setErr(String(e)))
  }, [])
  if (err) return <Err msg={err} />
  if (!data) return <div className="text-sm text-slate-400">{t('surv.amr_loading')}</div>
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
      <h3 className="text-[11px] uppercase tracking-widest font-bold text-emerald-300 mb-2">{t('surv.amr_report')}</h3>
      <pre className="text-xs text-slate-200 whitespace-pre-wrap font-mono max-h-[500px] overflow-y-auto">{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

function Err({ msg }: { msg: string }) {
  return <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-4 py-3 text-sm text-rose-200">⚠ {msg}</div>
}
