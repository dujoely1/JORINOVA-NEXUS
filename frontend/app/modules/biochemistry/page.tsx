'use client'

/**
 * Biochemistry module — section worklist + recent results.
 *
 * Consumes:
 *   GET /api/v1/biochemistry/results?section=&validated=
 *   GET /api/v1/biochemistry/reference-ranges
 *   PUT /api/v1/biochemistry/results/{id}/validate
 */

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
function authHeaders(): HeadersInit {
  const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}
}

interface BiochemResult {
  id: number
  section: string
  test_name?: string
  test_code?: string
  result_value?: string | null
  numeric_value?: number | null
  unit?: string | null
  flag?: string | null
  reference_range?: string | null
  status: string
  is_validated: boolean
  patient_id?: number
  created_at?: string
}

const SECTIONS = [
  { key: '',         labelKey: 'biochem.sec.all',     descKey: 'biochem.sec.all.d' },
  { key: 'GENERAL',  labelKey: 'biochem.sec.general', descKey: 'biochem.sec.general.d' },
  { key: 'LIVER',    labelKey: 'biochem.sec.liver',   descKey: 'biochem.sec.liver.d' },
  { key: 'RENAL',    labelKey: 'biochem.sec.renal',   descKey: 'biochem.sec.renal.d' },
  { key: 'LIPIDS',   labelKey: 'biochem.sec.lipids',  descKey: 'biochem.sec.lipids.d' },
  { key: 'CARDIAC',  labelKey: 'biochem.sec.cardiac', descKey: 'biochem.sec.cardiac.d' },
  { key: 'ENDO',     labelKey: 'biochem.sec.endo',    descKey: 'biochem.sec.endo.d' },
  { key: 'TUMOUR',   labelKey: 'biochem.sec.tumour',  descKey: 'biochem.sec.tumour.d' },
] as const

export default function BiochemPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Biochemistry" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [section, setSection] = useState('')
  const [rows, setRows] = useState<BiochemResult[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true); setErr(null)
    const p = new URLSearchParams()
    if (section) p.set('section', section)
    p.set('limit', '200')
    fetch(`${API}/api/v1/biochemistry/results?${p.toString()}`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status} — ${(await r.text()).slice(0, 80)}`); return r.json() })
      .then(j => setRows(Array.isArray(j) ? j : (j.results || [])))
      .catch(e => setErr(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [section])
  useEffect(load, [load])

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(245,127,23,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(245,127,23,0.06) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-amber-200" style={{ textShadow: '0 0 20px rgba(245,127,23,0.30)' }}>
            🧫 {t('mod.biochem')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.biochem.sub')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900/60 border border-slate-700/60 p-3">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors
                ${section === s.key
                  ? 'bg-amber-500/20 text-amber-200 border-amber-400/50'
                  : 'bg-slate-800/60 text-slate-300 border-slate-600 hover:bg-slate-800'}`}
              title={t(s.descKey)}
            >
              {t(s.labelKey)}
            </button>
          ))}
          <button onClick={load} className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-sky-600 text-white font-semibold">{t('common.refresh')}</button>
          <span className="text-xs text-slate-400 font-mono">{t('list.rows', { n: rows.length })}</span>
        </div>

        {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">⚠ {err}</div>}

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2.5">{t('tbl.section')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.test')}</th>
                  <th className="text-right px-3 py-2.5">{t('tbl.value')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.unit')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.reference')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.flag')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.status')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.patient')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.entered')}</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">{t('common.loading')}</td></tr>}
                {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">{t('list.no_results')}</td></tr>}
                {!loading && rows.map(r => (
                  <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-slate-400 text-xs">{r.section}</td>
                    <td className="px-3 py-2 text-slate-200 font-semibold">{r.test_name || r.test_code || '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-100 font-bold">{r.numeric_value ?? r.result_value ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{r.unit || '—'}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{r.reference_range || '—'}</td>
                    <td className="px-3 py-2"><FlagPill v={r.flag} /></td>
                    <td className="px-3 py-2"><StatusPill v={r.status} /></td>
                    <td className="px-3 py-2 text-slate-400 text-xs font-mono">PID {r.patient_id || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function FlagPill({ v }: { v?: string | null }) {
  if (!v || v === 'N') return <span className="text-slate-600">—</span>
  const color = v === 'HH' || v === 'LL' ? 'rose' : v === 'H' || v === 'L' ? 'amber' : 'slate'
  const map = { rose: 'text-rose-300 bg-rose-500/15 border-rose-400/30', amber: 'text-amber-300 bg-amber-500/15 border-amber-400/30', slate: 'text-slate-300 bg-slate-700/50 border-slate-500/30' } as const
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${map[color as keyof typeof map]}`}>{v}</span>
}
function StatusPill({ v }: { v: string }) {
  const up = (v || '').toUpperCase()
  const color = up === 'VALIDATED' || up === 'RELEASED' ? 'emerald' : up === 'AMENDED' ? 'purple' : up === 'PENDING' ? 'amber' : 'slate'
  const map = { emerald: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30', amber: 'text-amber-300 bg-amber-500/15 border-amber-400/30', purple: 'text-purple-300 bg-purple-500/15 border-purple-400/30', slate: 'text-slate-300 bg-slate-700/50 border-slate-500/30' } as const
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${map[color as keyof typeof map]}`}>{up}</span>
}
