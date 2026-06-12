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

type Tab = 'signals' | 'tracking' | 'amr' | 'field'

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
          </div>
        )
      })}
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
