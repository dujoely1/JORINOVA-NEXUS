'use client'

/**
 * Microbiology module — bacteriology (cultures + antibiogram) + parasitology.
 * Consumes /api/v1/microbiology/{cultures,parasitology,critical-book}
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
function authHeaders(): HeadersInit { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {} }

interface Culture { id: number; lab_request_id?: number; patient_id?: number; specimen_type?: string; growth_status?: string; organism_identified?: string; is_mrsa?: boolean; is_esbl?: boolean; is_cro?: boolean; gram_stain_result?: string; status: string; created_at?: string }
interface Parasito { id: number; lab_request_id?: number; patient_id?: number; specimen_type?: string; parasite?: string; parasitaemia_pct?: number; species?: string; status: string; created_at?: string }
interface Critical { id: number; entry_number: string; organism?: string; critical_reason: string; severity: string; archived_at?: string }

type Tab = 'bact' | 'paras' | 'critical'

export default function MicroPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Microbiology" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('bact')
  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(120,87,255,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(120,87,255,0.06) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-violet-200" style={{ textShadow: '0 0 20px rgba(120,87,255,0.30)' }}>
            🦠 {t('mod.micro')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.micro.sub')}</p>
          <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-700/60 -mb-px">
            {([
              ['bact',     t('micro.tab.bact'),     '🧫'],
              ['paras',    t('micro.tab.paras'),    '🔬'],
              ['critical', t('micro.tab.critical'), '🚨'],
            ] as const).map(([k, l, i]) => {
              const on = tab === k
              return (
                <button key={k} onClick={() => setTab(k as Tab)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-2
                    ${on ? 'text-violet-300 border-violet-400 bg-slate-900/60' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
                  <span>{i}</span>{l}
                </button>
              )
            })}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-5">
        {tab === 'bact'     && <BactTab />}
        {tab === 'paras'    && <ParasTab />}
        {tab === 'critical' && <CriticalTab />}
      </div>
    </>
  )
}

function useList<T>(url: string) {
  const [rows, setRows] = useState<T[]>([])
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => {
    fetch(`${API}${url}`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status} — ${(await r.text()).slice(0, 80)}`); return r.json() })
      .then(setRows).catch(e => setErr(String(e.message || e)))
  }, [url])
  useEffect(load, [load])
  return { rows, err }
}

function BactTab() {
  const t = useT()
  const { rows, err } = useList<Culture>('/api/v1/microbiology/cultures?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('tbl.id'),t('micro.h.specimen'),t('micro.h.growth'),t('micro.h.organism'),t('micro.h.gram'),t('micro.h.resistance'),t('tbl.status'),t('micro.h.when')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">#{r.id}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.specimen_type || '—'}</td>
          <td className="px-3 py-2 text-slate-300">{r.growth_status || '—'}</td>
          <td className="px-3 py-2 text-slate-200 font-semibold">{r.organism_identified || '—'}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.gram_stain_result || '—'}</td>
          <td className="px-3 py-2">
            {r.is_mrsa  && <span className="mr-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-400/30">MRSA</span>}
            {r.is_esbl  && <span className="mr-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-400/30">ESBL</span>}
            {r.is_cro   && <span className="mr-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-400/30">CRO</span>}
            {!r.is_mrsa && !r.is_esbl && !r.is_cro && <span className="text-slate-600">—</span>}
          </td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
          <td className="px-3 py-2 text-slate-500 text-xs">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">{t('micro.empty.bact')}</td></tr>}
    </Table>
  )
}

function ParasTab() {
  const t = useT()
  const { rows, err } = useList<Parasito>('/api/v1/microbiology/parasitology?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('tbl.id'),t('micro.h.specimen'),t('micro.h.parasite'),t('micro.h.species'),t('micro.h.parasitaemia'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">#{r.id}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.specimen_type || '—'}</td>
          <td className="px-3 py-2 text-slate-200 font-semibold">{r.parasite || '—'}</td>
          <td className="px-3 py-2 text-slate-300">{r.species || '—'}</td>
          <td className={`px-3 py-2 text-right font-bold ${
            r.parasitaemia_pct != null && r.parasitaemia_pct >= 4 ? 'text-rose-300' :
            r.parasitaemia_pct != null && r.parasitaemia_pct >= 1 ? 'text-amber-300' : 'text-slate-200'
          }`}>{r.parasitaemia_pct != null ? `${r.parasitaemia_pct}%` : '—'}</td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">{t('micro.empty.paras')}</td></tr>}
    </Table>
  )
}

function CriticalTab() {
  const t = useT()
  const { rows, err } = useList<Critical>('/api/v1/microbiology/critical-book?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('micro.h.entry'),t('micro.h.organism'),t('micro.h.reason'),t('micro.h.severity'),t('micro.h.archived')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-rose-300">{r.entry_number}</td>
          <td className="px-3 py-2 text-slate-200 font-semibold">{r.organism || '—'}</td>
          <td className="px-3 py-2 text-rose-200 font-bold">{r.critical_reason}</td>
          <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-200 border border-rose-400/40">{r.severity}</span></td>
          <td className="px-3 py-2 text-slate-500 text-xs">{r.archived_at ? new Date(r.archived_at).toLocaleString() : '—'}</td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">{t('micro.empty.critical')}</td></tr>}
    </Table>
  )
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
function StatusPill({ v }: { v: string }) {
  const up = (v || '').toUpperCase()
  const color = up === 'VALIDATED' || up === 'RELEASED' ? 'emerald' : up === 'AMENDED' ? 'purple' : up === 'PENDING' ? 'amber' : 'slate'
  const map = { emerald: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30', amber: 'text-amber-300 bg-amber-500/15 border-amber-400/30', purple: 'text-purple-300 bg-purple-500/15 border-purple-400/30', slate: 'text-slate-300 bg-slate-700/50 border-slate-500/30' } as const
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${map[color as keyof typeof map]}`}>{up}</span>
}
function Err({ msg }: { msg: string }) {
  return <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-4 py-3 text-sm text-rose-200">⚠ {msg}</div>
}
