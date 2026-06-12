'use client'

/**
 * Advanced Molecular module — 3 tabs over the mol_* advanced tables.
 * Backend: /api/v1/molecular-advanced/{runs,novel,predictions}
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

type Tab = 'runs' | 'novel' | 'predictions'

interface Run    { id: number; run_id: string; ngs_type: string; sequencer?: string; mean_coverage?: number; q30_score?: number; qc_pass: boolean; variants_found?: number; pathogenic_variants?: number; status: string }
interface Novel  { id: number; novel_id: string; gene_name?: string; mutation_type?: string; sequence_change?: string; ai_confidence?: number; predicted_impact?: string; alert_level?: string; publication_status: string; status: string }
interface Pred   { id: number; prediction_id: string; analysis_type: string; gene_target: string; mutation_detected?: string; acmg_class?: string; risk_score?: string; clinical_significance?: string; status: string }

export default function MolAdvPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Molecular · Advanced" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('runs')
  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(106,27,154,0.40)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(106,27,154,0.10) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-purple-200" style={{ textShadow: '0 0 20px rgba(106,27,154,0.40)' }}>
            🧬 {t('mol.title')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mol.sub')}</p>
          <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-700/60 -mb-px">
            {([
              ['runs',        t('mol.tab.runs'),  '🧬'],
              ['novel',       t('mol.tab.novel'), '⚠️'],
              ['predictions', t('mol.tab.pred'),  '🔮'],
            ] as const).map(([k, l, i]) => {
              const on = tab === k
              return (
                <button key={k} onClick={() => setTab(k as Tab)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-2
                    ${on ? 'text-purple-300 border-purple-400 bg-slate-900/60' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
                  <span>{i}</span>{l}
                </button>
              )
            })}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-5">
        {tab === 'runs'        && <RunsTab />}
        {tab === 'novel'       && <NovelTab />}
        {tab === 'predictions' && <PredTab />}
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

function RunsTab() {
  const t = useT()
  const { rows, err } = useList<Run>('/api/v1/molecular-advanced/runs?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('mol.h.run'),t('mol.h.ngs'),t('mol.h.sequencer'),t('mol.h.cov'),'Q30',t('mol.h.qc'),t('mol.h.variants'),t('mol.h.pathogenic'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.run_id}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.ngs_type}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.sequencer || '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-right">{r.mean_coverage != null ? `${r.mean_coverage}×` : '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-right">{r.q30_score != null ? `${r.q30_score}%` : '—'}</td>
          <td className="px-3 py-2">
            {r.qc_pass
              ? <PillStyled v="PASS" color="emerald" />
              : <PillStyled v="FAIL" color="rose" />}
          </td>
          <td className="px-3 py-2 text-slate-300 text-right">{r.variants_found ?? '—'}</td>
          <td className="px-3 py-2 text-right">
            {r.pathogenic_variants != null && r.pathogenic_variants > 0
              ? <span className="font-bold text-rose-300">{r.pathogenic_variants}</span>
              : <span className="text-slate-500">{r.pathogenic_variants ?? '—'}</span>}
          </td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">{t('mol.empty.runs')}</td></tr>}
    </Table>
  )
}

function NovelTab() {
  const t = useT()
  const { rows, err } = useList<Novel>('/api/v1/molecular-advanced/novel?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('mol.h.novel_id'),t('mol.h.gene'),t('mol.h.type'),t('mol.h.seq_change'),t('mol.h.ai_conf'),t('mol.h.impact'),t('mol.h.alert'),t('mol.h.publication'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.novel_id}</td>
          <td className="px-3 py-2 text-slate-200 font-semibold">{r.gene_name || '—'}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.mutation_type || '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-xs font-mono">{r.sequence_change || '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-right">{r.ai_confidence != null ? `${r.ai_confidence}%` : '—'}</td>
          <td className="px-3 py-2"><ImpactPill v={r.predicted_impact} /></td>
          <td className="px-3 py-2"><AlertPill v={r.alert_level} /></td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.publication_status}</td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">{t('mol.empty.novel')}</td></tr>}
    </Table>
  )
}

function PredTab() {
  const t = useT()
  const { rows, err } = useList<Pred>('/api/v1/molecular-advanced/predictions?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('mol.h.prediction'),t('mol.h.analysis'),t('mol.h.gene'),t('mol.h.mutation'),t('mol.h.acmg'),t('mol.h.risk'),t('mol.h.significance'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.prediction_id}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.analysis_type}</td>
          <td className="px-3 py-2 text-slate-200 font-semibold">{r.gene_target}</td>
          <td className="px-3 py-2 text-slate-300 text-xs font-mono">{r.mutation_detected || '—'}</td>
          <td className="px-3 py-2"><ACMGPill v={r.acmg_class} /></td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.risk_score || '—'}</td>
          <td className="px-3 py-2 text-slate-400 text-xs max-w-md truncate">{r.clinical_significance || '—'}</td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">{t('mol.empty.pred')}</td></tr>}
    </Table>
  )
}

// ── Pills ───────────────────────────────────────────────────────────────────

function ImpactPill({ v }: { v?: string }) {
  if (!v) return <span className="text-slate-600">—</span>
  const color = v === 'Pathogenic' ? 'rose'
              : v === 'Likely pathogenic' ? 'amber'
              : v === 'Uncertain' ? 'sky'
              : 'emerald'
  return <PillStyled v={v} color={color as any} />
}

function AlertPill({ v }: { v?: string }) {
  if (!v) return <span className="text-slate-600">—</span>
  const color = v === 'Emergency' || v === 'Alert' ? 'rose'
              : v === 'Warning' ? 'amber'
              : 'sky'
  return <PillStyled v={v} color={color as any} />
}

function ACMGPill({ v }: { v?: string }) {
  if (!v) return <span className="text-slate-600">—</span>
  const color = v === 'Pathogenic' ? 'rose'
              : v === 'Likely Pathogenic' ? 'amber'
              : v === 'VUS' ? 'sky'
              : 'emerald'
  return <PillStyled v={v} color={color as any} />
}

function StatusPill({ v }: { v: string }) {
  const up = (v || '').toUpperCase()
  const color = up === 'VALIDATED' || up === 'RELEASED' ? 'emerald'
              : up === 'AMENDED' ? 'purple'
              : up === 'PENDING' || up === 'VARIANT_CALLING' || up === 'QC_PENDING' ? 'amber'
              : up === 'RUNNING' ? 'sky'
              : up === 'FAILED' ? 'rose'
              : 'slate'
  return <PillStyled v={up} color={color as any} />
}

function PillStyled({ v, color }: { v: string; color: 'rose'|'amber'|'emerald'|'purple'|'sky'|'slate' }) {
  const map = {
    rose:    'text-rose-300 bg-rose-500/15 border-rose-400/30',
    amber:   'text-amber-300 bg-amber-500/15 border-amber-400/30',
    emerald: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30',
    purple:  'text-purple-300 bg-purple-500/15 border-purple-400/30',
    sky:     'text-sky-300 bg-sky-500/15 border-sky-400/30',
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
