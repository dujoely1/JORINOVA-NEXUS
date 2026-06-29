'use client'

/**
 * Anatomical Pathology module — 4 tabs over the anapath_* tables.
 *
 * Backend: /api/v1/anapath/{histology,cytology,ihc,image-analysis}
 */

import { useCallback, useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import AnapathImagePanel from '../../components/AnapathImagePanel'
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

type Tab = 'histology' | 'cytology' | 'ihc' | 'image'

interface Histo { id: number; accession_no: string; specimen_type: string; organ_site: string; diagnosis_category?: string; tumour_type?: string; grade?: string; margin_status?: string; ihc_ordered?: string; status: string; created_at?: string }
interface Cyto  { id: number; accession_no: string; cyto_type: string; adequacy?: string; bethesda_category?: string; recommendation?: string; status: string; created_at?: string }
interface IHC   { id: number; accession_no: string; marker: string; intensity?: string; percent_positive?: number; h_score?: number; interpretation?: string; status: string }
interface Image { id: number; analysis_id: string; image_type: string; ai_grade_suggestion?: string; ai_confidence?: number; pathologist_decision?: string; status: string }

export default function AnapathPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Anatomical Pathology" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('histology')
  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(123,31,162,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(123,31,162,0.08) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-purple-200" style={{ textShadow: '0 0 20px rgba(123,31,162,0.30)' }}>
            🔭 {t('ap.title')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('ap.sub')}</p>
          <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-700/60 -mb-px">
            {([
              ['histology', t('ap.tab.histo'), '🔬'],
              ['cytology',  t('ap.tab.cyto'),  '💧'],
              ['ihc',       t('ap.tab.ihc'),   '🎨'],
              ['image',     t('ap.tab.image'), '🖼️'],
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
        {tab === 'histology' && <HistoTab />}
        {tab === 'cytology'  && <CytoTab />}
        {tab === 'ihc'       && <IHCTab />}
        {tab === 'image'     && <><AnapathImagePanel /><ImageTab /></>}
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

function HistoTab() {
  const t = useT()
  const { rows, err } = useList<Histo>('/api/v1/anapath/histology?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('ap.h.accession'),t('ap.h.specimen'),t('ap.h.organ'),t('ap.h.diagnosis'),t('ap.h.tumour'),t('ap.h.grade'),t('ap.h.margin'),t('ap.h.ihc'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.accession_no}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.specimen_type}</td>
          <td className="px-3 py-2 text-slate-300">{r.organ_site}</td>
          <td className="px-3 py-2"><DiagnosisPill v={r.diagnosis_category} /></td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.tumour_type || '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-xs font-mono">{r.grade || '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.margin_status || '—'}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.ihc_ordered || '—'}</td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">{t('ap.empty.histo')}</td></tr>}
    </Table>
  )
}

function CytoTab() {
  const t = useT()
  const { rows, err } = useList<Cyto>('/api/v1/anapath/cytology?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('ap.h.accession'),t('tbl.type'),t('ap.h.adequacy'),t('ap.h.bethesda'),t('ap.h.reco'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.accession_no}</td>
          <td className="px-3 py-2 text-slate-300">{r.cyto_type}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.adequacy || '—'}</td>
          <td className="px-3 py-2"><BethesdaPill v={r.bethesda_category} /></td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.recommendation || '—'}</td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">{t('ap.empty.cyto')}</td></tr>}
    </Table>
  )
}

function IHCTab() {
  const t = useT()
  const { rows, err } = useList<IHC>('/api/v1/anapath/ihc?limit=300')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('ap.h.linked'),t('ap.h.marker'),t('ap.h.intensity'),t('ap.h.percent_pos'),t('ap.h.hscore'),t('ap.h.interp'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.accession_no}</td>
          <td className="px-3 py-2 text-slate-200 font-semibold">{r.marker}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.intensity || '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-right">{r.percent_positive ?? '—'}{r.percent_positive !== null && r.percent_positive !== undefined ? '%' : ''}</td>
          <td className="px-3 py-2 text-slate-300 text-right">{r.h_score ?? '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.interpretation || '—'}</td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">{t('ap.empty.ihc')}</td></tr>}
    </Table>
  )
}

function ImageTab() {
  const t = useT()
  const { rows, err } = useList<Image>('/api/v1/anapath/image-analysis?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('ap.h.analysis_id'),t('ap.h.image_type'),t('ap.h.ai_grade'),t('ap.h.ai_conf'),t('ap.h.path_decision'),t('tbl.status')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.analysis_id}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.image_type}</td>
          <td className="px-3 py-2 text-slate-200 font-bold">{r.ai_grade_suggestion || '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-right">{r.ai_confidence != null ? `${r.ai_confidence}%` : '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{r.pathologist_decision || '—'}</td>
          <td className="px-3 py-2"><StatusPill v={r.status} /></td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">{t('ap.empty.image')}</td></tr>}
    </Table>
  )
}

// ── Pills ───────────────────────────────────────────────────────────────────

function DiagnosisPill({ v }: { v?: string }) {
  if (!v) return <span className="text-slate-600">—</span>
  const color = v === 'Malignant' ? 'rose'
              : v === 'Pre-malignant' ? 'amber'
              : v === 'Benign' || v === 'Normal/Reactive' ? 'emerald'
              : 'slate'
  return <Pill v={v} color={color as any} />
}

function BethesdaPill({ v }: { v?: string }) {
  if (!v) return <span className="text-slate-600">—</span>
  const danger = ['HSIL','ASC-H','SCC','AGC','AIS','Adenocarcinoma','Malignant - other','Suspicious for malignancy']
  const warn   = ['ASC-US','LSIL']
  const color = danger.includes(v) ? 'rose' : warn.includes(v) ? 'amber' : 'emerald'
  return <Pill v={v} color={color as any} />
}

function StatusPill({ v }: { v: string }) {
  const up = (v || '').toUpperCase()
  const color = up === 'VALIDATED' || up === 'RELEASED' ? 'emerald'
              : up === 'AMENDED' ? 'purple'
              : up === 'PENDING' || up === 'PENDING_PATHOLOGIST' || up === 'IHC_ORDERED' ? 'amber'
              : up === 'DRAFT' ? 'slate'
              : 'sky'
  return <Pill v={up} color={color as any} />
}

function Pill({ v, color }: { v: string; color: 'rose'|'amber'|'emerald'|'purple'|'sky'|'slate' }) {
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
