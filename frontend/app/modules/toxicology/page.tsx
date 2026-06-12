'use client'

/**
 * Toxicology module — 3 tabs over the tox_* tables.
 * Backend: /api/v1/toxicology/{drug-screen,tdm,poisoning}
 */

import { useCallback, useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit {
  const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}
}

type Tab = 'uds' | 'tdm' | 'poisoning'

interface UDS { id: number; screen_id: string; panel_type: string; thc?: string; opiates?: string; cocaine?: string; amphetamines?: string; benzodiazepines?: string; overall_result?: string; confirmatory_required?: string; status: string }
interface TDM { id: number; tdm_id: string; drug_name: string; level_type: string; concentration?: number; unit?: string; therapeutic_range?: string; interpretation?: string; status: string }
interface Poi { id: number; case_no: string; poison_type: string; result_value?: number; unit?: string; severity?: string; antidote_given?: string; outcome?: string; status: string }

export default function ToxPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Toxicology" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('uds')
  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(245,158,11,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(245,158,11,0.08) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-amber-200" style={{ textShadow: '0 0 20px rgba(245,158,11,0.30)' }}>
            ☠️ {t('tox.title')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('tox.sub')}</p>
          <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-700/60 -mb-px">
            {([
              ['uds',       t('tox.tab.uds'), '💊'],
              ['tdm',       t('tox.tab.tdm'), '💉'],
              ['poisoning', t('tox.tab.poi'), '☠️'],
            ] as const).map(([k, l, i]) => {
              const on = tab === k
              return (
                <button key={k} onClick={() => setTab(k as Tab)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-2
                    ${on ? 'text-amber-300 border-amber-400 bg-slate-900/60' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
                  <span>{i}</span>{l}
                </button>
              )
            })}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-5">
        {tab === 'uds'       && <UDSTab />}
        {tab === 'tdm'       && <TDMTab />}
        {tab === 'poisoning' && <PoiTab />}
      </div>
    </>
  )
}

function useList<T>(endpoint: string) {
  const [rows, setRows] = useState<T[]>([])
  const [err, setErr]   = useState<string | null>(null)
  const load = useCallback(() => {
    fetch(`${API}${endpoint}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setRows).catch(e => setErr(String(e)))
  }, [endpoint])
  useEffect(load, [load])
  return { rows, err, reload: load }
}

function UDSTab() {
  const t = useT()
  const { rows, err } = useList<UDS>('/api/v1/toxicology/drug-screen?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('tox.h.screen'),t('tox.h.panel'),'THC','Opi','Coc','Amph','Benzo',t('tox.h.overall'),t('tox.h.confirmatory'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.screen_id}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.panel_type}</td>
          <td className="px-3 py-2"><PosNeg v={r.thc} /></td>
          <td className="px-3 py-2"><PosNeg v={r.opiates} /></td>
          <td className="px-3 py-2"><PosNeg v={r.cocaine} /></td>
          <td className="px-3 py-2"><PosNeg v={r.amphetamines} /></td>
          <td className="px-3 py-2"><PosNeg v={r.benzodiazepines} /></td>
          <td className="px-3 py-2"><PosNeg v={r.overall_result} bold /></td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.confirmatory_required || '—'}</td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400">{t('tox.empty.uds')}</td></tr>}
    </Table>
  )
}

function TDMTab() {
  const t = useT()
  const { rows, err } = useList<TDM>('/api/v1/toxicology/tdm?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('tox.h.tdm'),t('tox.h.drug'),t('tox.h.level'),t('tox.h.concentration'),t('tbl.unit'),t('tox.h.range'),t('tox.h.interp'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.tdm_id}</td>
          <td className="px-3 py-2 text-slate-200 font-semibold">{r.drug_name}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.level_type}</td>
          <td className="px-3 py-2 text-slate-100 font-bold text-right">{r.concentration ?? '—'}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.unit || '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.therapeutic_range || '—'}</td>
          <td className="px-3 py-2"><InterpPill v={r.interpretation} /></td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">{t('tox.empty.tdm')}</td></tr>}
    </Table>
  )
}

function PoiTab() {
  const t = useT()
  const { rows, err } = useList<Poi>('/api/v1/toxicology/poisoning?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('tox.h.case'),t('tox.h.poison'),t('tox.h.level'),t('tox.h.severity'),t('tox.h.antidote'),t('tox.h.outcome'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.case_no}</td>
          <td className="px-3 py-2 text-slate-200 font-semibold">{r.poison_type}</td>
          <td className="px-3 py-2 text-slate-300 text-right">{r.result_value != null ? `${r.result_value} ${r.unit || ''}` : '—'}</td>
          <td className="px-3 py-2"><SeverityPill v={r.severity} /></td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.antidote_given || '—'}</td>
          <td className="px-3 py-2"><OutcomePill v={r.outcome} /></td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">{t('tox.empty.poi')}</td></tr>}
    </Table>
  )
}

// ── Pills ───────────────────────────────────────────────────────────────────

function PosNeg({ v, bold }: { v?: string; bold?: boolean }) {
  if (!v) return <span className="text-slate-600">—</span>
  const pos = v === 'Positive'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${bold ? 'font-extrabold' : 'font-bold'} border
      ${pos ? 'text-rose-300 bg-rose-500/15 border-rose-400/30' : 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'}`}>
      {v}
    </span>
  )
}

function InterpPill({ v }: { v?: string }) {
  if (!v) return <span className="text-slate-600">—</span>
  const color = v === 'Toxic' ? 'rose' : v === 'Sub-therapeutic' ? 'amber' : 'emerald'
  return <PillStyled v={v} color={color as any} />
}

function SeverityPill({ v }: { v?: string }) {
  if (!v) return <span className="text-slate-600">—</span>
  const color = v === 'Critical' || v === 'Severe' ? 'rose' : v === 'Moderate' ? 'amber' : 'emerald'
  return <PillStyled v={v} color={color as any} />
}

function OutcomePill({ v }: { v?: string }) {
  if (!v) return <span className="text-slate-600">—</span>
  const color = v === 'Death' ? 'rose'
              : v === 'Transferred ICU' ? 'amber'
              : v === 'Recovered' || v === 'Improved' ? 'emerald'
              : 'slate'
  return <PillStyled v={v} color={color as any} />
}

function StatusPill({ v }: { v: string }) {
  const up = (v || '').toUpperCase()
  const color = up === 'VALIDATED' || up === 'RELEASED' ? 'emerald'
              : up === 'AMENDED' ? 'purple'
              : up === 'PENDING' ? 'amber'
              : 'slate'
  return <PillStyled v={up} color={color as any} />
}

function PillStyled({ v, color }: { v: string; color: 'rose'|'amber'|'emerald'|'purple'|'slate' }) {
  const map = {
    rose:    'text-rose-300 bg-rose-500/15 border-rose-400/30',
    amber:   'text-amber-300 bg-amber-500/15 border-amber-400/30',
    emerald: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30',
    purple:  'text-purple-300 bg-purple-500/15 border-purple-400/30',
    slate:   'text-slate-300 bg-slate-700/50 border-slate-500/30',
  } as const
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${map[color]}`}>{v}</span>
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
            <tr>{headers.map(h => <th key={h} className="text-left px-3 py-2.5 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}

function Err({ msg }: { msg: string }) {
  return <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-4 py-3 text-sm text-rose-200">⚠ {msg}</div>
}
