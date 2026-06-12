'use client'

/** Serology module — HIV, HBV, HCV, syphilis, autoimmune. */
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

interface SeroResult {
  id: number
  test_name?: string
  test_code?: string
  qualitative?: string
  sco_ratio?: number
  method?: string
  bsl_2_alert?: boolean
  confirmatory_required?: boolean
  confirmatory_done?: boolean
  status: string
  patient_id?: number
  created_at?: string
}

export default function SeroPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Serology" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [rows, setRows] = useState<SeroResult[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [reactiveOnly, setReactiveOnly] = useState(false)
  const load = useCallback(() => {
    fetch(`${API}/api/v1/serology/results?limit=200`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setRows).catch(e => setErr(String(e.message || e)))
  }, [])
  useEffect(load, [load])

  const filtered = reactiveOnly ? rows.filter(r => (r.qualitative || '').toUpperCase().includes('REACTIVE') || (r.qualitative || '').toUpperCase().includes('POSITIVE')) : rows

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(220,38,38,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(220,38,38,0.06) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-rose-200" style={{ textShadow: '0 0 20px rgba(220,38,38,0.30)' }}>
            🩸 {t('mod.sero')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.sero.sub')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900/60 border border-slate-700/60 p-3">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={reactiveOnly} onChange={e => setReactiveOnly(e.target.checked)} />
            {t('sero.reactive_only')}
          </label>
          <button onClick={load} className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-sky-600 text-white font-semibold">{t('common.refresh')}</button>
          <span className="text-xs text-slate-400 font-mono">{t('list.rows', { n: filtered.length })}</span>
        </div>

        {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">⚠ {err}</div>}

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2.5">{t('tbl.test')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.result')}</th>
                  <th className="text-right px-3 py-2.5">S/CO</th>
                  <th className="text-left px-3 py-2.5">{t('sero.h.method')}</th>
                  <th className="text-left px-3 py-2.5">{t('sero.h.confirmatory')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.status')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.patient')}</th>
                  <th className="text-left px-3 py-2.5">{t('sero.h.when')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">{t('sero.empty')}</td></tr>}
                {filtered.map(r => {
                  const reactive = (r.qualitative || '').toUpperCase().includes('REACTIVE') || (r.qualitative || '').toUpperCase().includes('POSITIVE')
                  return (
                    <tr key={r.id} className={`border-t border-slate-800/60 ${reactive ? 'bg-rose-950/20' : ''} hover:bg-slate-800/30`}>
                      <td className="px-3 py-2 text-slate-200 font-semibold">{r.test_name || r.test_code || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          reactive ? 'text-rose-300 bg-rose-500/15 border-rose-400/30' : 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'
                        }`}>{r.qualitative || '—'}</span>
                        {r.bsl_2_alert && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-400/30">BSL-2</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">{r.sco_ratio ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">{r.method || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.confirmatory_required
                          ? (r.confirmatory_done
                            ? <span className="text-emerald-300">{t('sero.conf.done')}</span>
                            : <span className="text-amber-300">{t('sero.conf.pending')}</span>)
                          : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-3 py-2"><StatusPill v={r.status} /></td>
                      <td className="px-3 py-2 text-slate-400 text-xs font-mono">PID {r.patient_id || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 text-xs">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function StatusPill({ v }: { v: string }) {
  const up = (v || '').toUpperCase()
  const color = up === 'VALIDATED' || up === 'RELEASED' ? 'emerald' : up === 'AMENDED' ? 'purple' : up === 'PENDING' ? 'amber' : 'slate'
  const map = { emerald: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30', amber: 'text-amber-300 bg-amber-500/15 border-amber-400/30', purple: 'text-purple-300 bg-purple-500/15 border-purple-400/30', slate: 'text-slate-300 bg-slate-700/50 border-slate-500/30' } as const
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${map[color as keyof typeof map]}`}>{up}</span>
}
