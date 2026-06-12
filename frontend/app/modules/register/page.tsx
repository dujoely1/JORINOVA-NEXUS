'use client'

/**
 * Register / Books module — the front door to the 38-book ISO 15189
 * laboratory record system.
 *
 * Layout:
 *   left  → category-grouped book picker (sidebar)
 *   right → selected book: filters + entries table + amendment chains
 *
 * Consumes:
 *   GET  /api/v1/records/books                        — catalog
 *   GET  /api/v1/records/books/{id}/entries           — entries (filtered)
 *   GET  /api/v1/amendments/{source_table}/{source_id} — chain for a row
 *   POST /api/v1/amendments/{source_table}/{source_id} — file a correction
 *
 * Every validated lab result lands in its dept book automatically.
 * Edits to validated rows are rejected — corrections go through the
 * amendment modal, which writes an immutable ResultAmendment chain.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// ── Types ───────────────────────────────────────────────────────────────────

interface BookColumn { key: string; label: string; type: string; options?: string[] }
interface Book {
  id: string; name: string; category: string; icon: string; description: string
  accent: string; gradient: string; department: string; columns: BookColumn[]
}
interface Catalog { categories: string[]; books: Record<string, Record<string, Book>>; total: number }
interface Entry  { record_no: string; pid: string; status: string; is_validated: boolean; is_critical?: boolean; created_at: string; [k: string]: any }
interface EntryPage { book_id: string; book_name: string; total: number; columns: BookColumn[]; entries: Entry[] }

interface Amendment {
  amendment_number: string; amended_at: string; amended_by_id: number
  before_value: string; after_value: string; before_flag?: string; after_flag?: string
  reason: string; reason_detail?: string; critical_book_entry?: string
}

// book_id → source_table for the amendments endpoint
const SOURCE_TABLE: Record<string, string> = {
  hematology: 'hem_result',
  peripheral_smear: 'hem_result',
  coagulation: 'coag_result',
  general_chemistry: 'biochem_result',
  endocrinology: 'biochem_result',
  tumour_markers: 'biochem_result',
  cardiac_markers: 'biochem_result',
  serology_hiv: 'sero_result',
  hepatitis_book: 'sero_result',
  autoimmune_book: 'sero_result',
  widal_serogroup: 'sero_result',
  blood_culture: 'micro_culture',
  urine_culture: 'micro_culture',
  stool_microbiology: 'micro_culture',
  wound_swab: 'micro_culture',
  body_fluid: 'micro_culture',
  sputum_tb: 'micro_culture',
  urinalysis_book: 'dipstick_result',
  viral_load_book: 'viral_load',
  tb_analysis: 'pcr_result',
  pcr_molecular: 'pcr_result',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(extra?: HeadersInit): HeadersInit {
  const tok = getToken()
  return { ...(extra || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }
}

// ── Page wrappers ───────────────────────────────────────────────────────────

export default function RegisterPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Register" theme="dark">
        <RegisterInner />
      </AppShell>
    </RequireAuth>
  )
}

function RegisterInner() {
  const t = useT()
  const [catalog,  setCatalog]  = useState<Catalog | null>(null)
  const [bookId,   setBookId]   = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [err,      setErr]      = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/api/v1/records/books`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((c: Catalog) => {
        setCatalog(c)
        // Pre-select the first book in the first category
        const first = c.categories.find(cat => c.books[cat])
        if (first) {
          const firstBookId = Object.keys(c.books[first])[0]
          if (firstBookId) setBookId(firstBookId)
        }
      })
      .catch(e => setErr(t('reg.catalog_err', { e: String(e) })))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const filteredCatalog = useMemo(() => {
    if (!catalog || !search.trim()) return catalog
    const q = search.trim().toLowerCase()
    const filtered: Catalog['books'] = {}
    for (const cat of catalog.categories) {
      const matches: Record<string, Book> = {}
      for (const [bid, b] of Object.entries(catalog.books[cat] || {})) {
        if (b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q)) {
          matches[bid] = b
        }
      }
      if (Object.keys(matches).length) filtered[cat] = matches
    }
    return { ...catalog, books: filtered }
  }, [catalog, search])

  const selectedBook: Book | null = useMemo(() => {
    if (!catalog || !bookId) return null
    for (const cat of catalog.categories) {
      const b = catalog.books[cat]?.[bookId]
      if (b) return b
    }
    return null
  }, [catalog, bookId])

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section
        className="border-b"
        style={{
          borderColor: 'rgba(56,189,248,0.18)',
          background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(56,189,248,0.06) 100%)',
        }}
      >
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-sky-200"
                  style={{ textShadow: '0 0 22px rgba(56,189,248,0.30)' }}>
                {t('reg.title')}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {catalog ? t('reg.subtitle', { n: catalog.total, c: catalog.categories.length }) : t('common.loading')}
              </p>
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('reg.search_books')}
              className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-400 outline-none w-64"
            />
          </div>
          {err && <div className="mt-3 rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">{err}</div>}
        </div>
      </section>

      {/* ── Body: book picker + book viewer ─────────────────────────── */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        <BookPicker
          catalog={filteredCatalog}
          selectedId={bookId}
          onSelect={setBookId}
        />
        <BookViewer book={selectedBook} />
      </div>
    </>
  )
}

// ── Book picker ─────────────────────────────────────────────────────────────

function BookPicker({
  catalog, selectedId, onSelect,
}: { catalog: Catalog | null; selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useT()
  if (!catalog) return <aside className="text-sm text-slate-400">{t('reg.loading_catalog')}</aside>
  return (
    <aside className="space-y-4 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:pr-2">
      {catalog.categories.map(cat => {
        const books = catalog.books[cat]
        if (!books || Object.keys(books).length === 0) return null
        return (
          <div key={cat}>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1.5">{cat}</div>
            <ul className="space-y-1">
              {Object.values(books).map(b => {
                const on = b.id === selectedId
                return (
                  <li key={b.id}>
                    <button
                      onClick={() => onSelect(b.id)}
                      className={`w-full text-left rounded-lg border px-2.5 py-2 transition-colors
                        ${on
                          ? 'bg-sky-500/15 border-sky-400/50 text-slate-100'
                          : 'bg-slate-900/50 border-slate-700/60 text-slate-300 hover:bg-slate-900/80 hover:border-slate-500/60'}`}
                      style={on ? { boxShadow: `0 0 16px ${b.accent}40` } : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg" aria-hidden>{b.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{b.name.replace(/^\W+\s*/, '')}</div>
                          <div className="text-[10px] text-slate-500 truncate">{b.description}</div>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </aside>
  )
}

// ── Book viewer ─────────────────────────────────────────────────────────────

function BookViewer({ book }: { book: Book | null }) {
  const t = useT()
  const [page,    setPage]    = useState<EntryPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState<string | null>(null)
  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [status,   setStatus]   = useState('')
  const [shift,    setShift]    = useState('')
  // Amendment modal
  const [amending, setAmending] = useState<Entry | null>(null)
  const [chainFor, setChainFor] = useState<Entry | null>(null)

  const load = useCallback(() => {
    if (!book) return
    setLoading(true); setErr(null); setPage(null)
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo)   params.set('date_to',   dateTo)
    if (status)   params.set('status',    status)
    if (shift)    params.set('shift',     shift)
    params.set('limit', '200')
    fetch(`${API}/api/v1/records/books/${book.id}/entries?${params.toString()}`, { headers: authHeaders() })
      .then(async r => {
        if (!r.ok) { const t = await r.text(); throw new Error(`HTTP ${r.status} — ${t.slice(0, 200)}`) }
        return r.json()
      })
      .then((p: EntryPage) => setPage(p))
      .catch(e => setErr(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [book, dateFrom, dateTo, status, shift])

  useEffect(load, [load])

  if (!book) {
    return (
      <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-10 text-center text-slate-400 text-sm">
        {t('reg.pick_book')}
      </section>
    )
  }

  const sourceTable = SOURCE_TABLE[book.id]

  return (
    <section
      className="rounded-xl border bg-slate-900/60 backdrop-blur p-4 shadow-sm"
      style={{ borderColor: `${book.accent}55`, boxShadow: `0 0 18px ${book.accent}15` }}
    >
      {/* Title strip */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100" style={{ textShadow: `0 0 12px ${book.accent}77` }}>
            <span className="mr-1">{book.icon}</span>{book.name}
          </h2>
          <div className="text-[11px] text-slate-400 mt-0.5">{book.description}</div>
        </div>
        <div className="text-[11px] text-slate-400">
          {page ? t('reg.entries_count', { shown: page.entries.length, total: page.total }) : ''}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <DateInput label={t('reg.f.from')} value={dateFrom} onChange={setDateFrom} />
        <DateInput label={t('reg.f.to')}   value={dateTo}   onChange={setDateTo}   />
        <SelectInput label={t('reg.f.status')} value={status} onChange={setStatus}
          options={[['',t('reg.opt.any')],['PENDING',t('status.pending')],['VALIDATED',t('status.validated')],['RELEASED',t('status.released')],['AMENDED',t('status.amended')]]} />
        <SelectInput label={t('reg.f.shift')} value={shift} onChange={setShift}
          options={[['',t('reg.opt.any')],['morning',t('reg.opt.morning')],['afternoon',t('reg.opt.afternoon')],['night',t('reg.opt.night')]]} />
        <button onClick={load}
          className="ml-auto px-3 py-2 text-xs rounded-lg bg-sky-600/80 text-white font-semibold hover:bg-sky-600">
          {t('common.refresh')}
        </button>
      </div>

      {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200 mb-3">{err}</div>}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700/60">
        <table className="w-full text-xs">
          <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left px-3 py-2">#</th>
              {book.columns.slice(0, 8).map(c => (
                <th key={c.key} className="text-left px-3 py-2 whitespace-nowrap">{c.label}</th>
              ))}
              <th className="text-right px-3 py-2">{t('reg.h.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400">{t('reg.loading_entries')}</td></tr>
            )}
            {!loading && page && page.entries.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-500">{t('reg.no_entries')}</td></tr>
            )}
            {!loading && page && page.entries.map((e, idx) => {
              const isLocked = ['VALIDATED','RELEASED','AMENDED'].includes(String(e.status))
              return (
                <tr key={e.record_no || idx} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-3 py-2 font-mono text-slate-400">{e.record_no}</td>
                  {book.columns.slice(0, 8).map(c => (
                    <td key={c.key} className="px-3 py-2 whitespace-nowrap">
                      {renderCell(e[c.key], c)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {sourceTable && (
                      <>
                        <button onClick={() => setChainFor(e)}
                          className="px-2 py-0.5 text-[10px] rounded-md font-semibold bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700">
                          {t('reg.history')}
                        </button>
                        {isLocked && (
                          <button onClick={() => setAmending(e)}
                            className="ml-1 px-2 py-0.5 text-[10px] rounded-md font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/30 hover:bg-amber-500/25">
                            {t('reg.amend')}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="mt-3 text-[11px] text-slate-500">
        {t('reg.source_table')} <span className="font-mono">{sourceTable || t('reg.admin_book')}</span> ·
        {' '}{t('reg.department')} <span className="font-mono">{book.department}</span> ·
        {' '}{t('reg.immutable_note')}
      </div>

      {amending && sourceTable && (
        <AmendmentModal book={book} entry={amending} sourceTable={sourceTable}
                        onClose={() => setAmending(null)}
                        onSaved={() => { setAmending(null); load() }} />
      )}
      {chainFor && sourceTable && (
        <ChainModal book={book} entry={chainFor} sourceTable={sourceTable}
                    onClose={() => setChainFor(null)} />
      )}
    </section>
  )
}

// ── Cell renderer ───────────────────────────────────────────────────────────

function renderCell(value: any, col: BookColumn) {
  if (value == null || value === '') return <span className="text-slate-600">—</span>
  if (col.type === 'flag' || col.key.toLowerCase().endsWith('_flag') || col.key === 'flag') {
    const v = String(value).toUpperCase()
    const color = v === 'HH' || v === 'CRITICAL' ? 'text-rose-300 bg-rose-500/15 border-rose-400/30'
                : v === 'LL'                       ? 'text-rose-300 bg-rose-500/15 border-rose-400/30'
                : v === 'H' || v === 'L'           ? 'text-amber-300 bg-amber-500/15 border-amber-400/30'
                : v === 'N'                        ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'
                : 'text-slate-300 bg-slate-700/50 border-slate-500/30'
    return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${color}`}>{v}</span>
  }
  if (col.key === 'status') {
    const v = String(value).toUpperCase()
    const color = v === 'VALIDATED' || v === 'RELEASED' ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'
                : v === 'AMENDED'   ? 'text-purple-300 bg-purple-500/15 border-purple-400/30'
                : v === 'PENDING'   ? 'text-amber-300  bg-amber-500/15  border-amber-400/30'
                : 'text-slate-300 bg-slate-700/50 border-slate-500/30'
    return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${color}`}>{v}</span>
  }
  return <span className="text-slate-200">{String(value)}</span>
}

// ── Tiny input bits ─────────────────────────────────────────────────────────

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
      {label}
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className="bg-slate-800/80 border border-slate-600 rounded-md px-2 py-1 text-xs text-slate-100" />
    </label>
  )
}

function SelectInput({ label, value, onChange, options }:
  { label: string; value: string; onChange: (v: string) => void; options: [string,string][] }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-slate-800/80 border border-slate-600 rounded-md px-2 py-1 text-xs text-slate-100">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

// ── Amendment modal ─────────────────────────────────────────────────────────

function AmendmentModal({
  book, entry, sourceTable, onClose, onSaved,
}: { book: Book; entry: Entry; sourceTable: string; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const [reason, setReason] = useState('transcription_error')
  const [detail, setDetail] = useState('')
  const [newValue, setNewValue] = useState(String(entry.result_value ?? entry.numeric_value ?? ''))
  const [newFlag, setNewFlag] = useState(String(entry.flag ?? ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setBusy(true); setErr(null)
    try {
      const body = {
        new_values: {
          result_value: newValue || undefined,
          numeric_value: !isNaN(Number(newValue)) && newValue !== '' ? Number(newValue) : undefined,
          flag: newFlag || undefined,
        },
        reason, reason_detail: detail || undefined,
      }
      const sourceId = entry.id || entry.source_id
      if (!sourceId) throw new Error('Source row id missing — backend needs to surface it for this book.')
      const r = await fetch(`${API}/api/v1/amendments/${sourceTable}/${sourceId}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      onSaved()
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-amber-400/40 rounded-2xl max-w-xl w-full p-5 shadow-2xl"
           style={{ boxShadow: '0 0 40px rgba(245,158,11,0.15)' }}>
        <h3 className="text-lg font-bold text-amber-200 mb-1">{t('reg.am.title')}</h3>
        <p className="text-[11px] text-slate-400 mb-4">
          {book.name} · {entry.record_no} · {t('reg.am.subtitle')}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('reg.am.new_value')}>
            <input value={newValue} onChange={e => setNewValue(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full" />
          </Field>
          <Field label={t('reg.am.new_flag')}>
            <select value={newFlag} onChange={e => setNewFlag(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full">
              <option value="">{t('reg.am.no_change')}</option>
              <option value="N">{t('reg.am.flag_n')}</option>
              <option value="H">{t('reg.am.flag_h')}</option>
              <option value="L">{t('reg.am.flag_l')}</option>
              <option value="HH">{t('reg.am.flag_hh')}</option>
              <option value="LL">{t('reg.am.flag_ll')}</option>
            </select>
          </Field>
          <Field label={t('reg.am.reason')} full>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full">
              <option value="transcription_error">{t('reg.am.r_transcription')}</option>
              <option value="clinician_clarification">{t('reg.am.r_clarification')}</option>
              <option value="analyzer_recheck">{t('reg.am.r_recheck')}</option>
              <option value="critical_recheck">{t('reg.am.r_critical')}</option>
              <option value="pre_release_correction">{t('reg.am.r_prerelease')}</option>
              <option value="other">{t('reg.am.r_other')}</option>
            </select>
          </Field>
          <Field label={t('reg.am.detail')} full>
            <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full"
              placeholder={t('reg.am.detail_ph')} />
          </Field>
        </div>

        {err && <div className="mt-3 text-xs text-rose-300">⚠ {err}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-600">
            {t('common.cancel')}
          </button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-amber-950 hover:bg-amber-400 disabled:opacity-50">
            {busy ? t('reg.am.filing') : t('reg.am.file')}
          </button>
        </div>
      </div>
    </div>
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

// ── Amendment chain modal ──────────────────────────────────────────────────

function ChainModal({
  book, entry, sourceTable, onClose,
}: { book: Book; entry: Entry; sourceTable: string; onClose: () => void }) {
  const t = useT()
  const [chain, setChain] = useState<Amendment[] | null>(null)
  const [err,   setErr]   = useState<string | null>(null)

  useEffect(() => {
    const sid = entry.id || entry.source_id
    if (!sid) { setErr('No source id'); return }
    fetch(`${API}/api/v1/amendments/${sourceTable}/${sid}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(j => setChain(j.chain || []))
      .catch(e => setErr(String(e)))
  }, [entry, sourceTable])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-sky-400/40 rounded-2xl max-w-2xl w-full p-5 shadow-2xl">
        <h3 className="text-lg font-bold text-sky-200">{t('reg.chain.title')}</h3>
        <p className="text-[11px] text-slate-400 mb-3">{book.name} · {entry.record_no}</p>

        {err && <div className="text-xs text-rose-300">⚠ {err}</div>}
        {!chain && !err && <div className="text-xs text-slate-400">{t('common.loading')}</div>}
        {chain && chain.length === 0 && (
          <div className="text-sm text-slate-400 py-6 text-center">{t('reg.chain.empty')}</div>
        )}
        {chain && chain.length > 0 && (
          <ol className="space-y-2 max-h-[60vh] overflow-y-auto">
            {chain.map((a, i) => (
              <li key={a.amendment_number} className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-3 text-xs">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] text-sky-300">#{i+1} · {a.amendment_number}</span>
                  <span className="text-[10px] text-slate-500">{a.amended_at}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-slate-900/60 border border-slate-700 px-2 py-1.5">
                    <div className="text-[10px] text-slate-500 uppercase">{t('reg.chain.before')}</div>
                    <div className="text-slate-200 font-mono">{a.before_value || '—'}</div>
                    {a.before_flag && <div className="text-[10px] text-amber-300">flag={a.before_flag}</div>}
                  </div>
                  <div className="rounded-md bg-slate-900/60 border border-emerald-700/40 px-2 py-1.5">
                    <div className="text-[10px] text-emerald-400 uppercase">{t('reg.chain.after')}</div>
                    <div className="text-emerald-200 font-mono">{a.after_value || '—'}</div>
                    {a.after_flag && <div className="text-[10px] text-emerald-300">flag={a.after_flag}</div>}
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-slate-300">
                  <b className="text-slate-400">{t('reg.chain.reason')}</b> {a.reason.replace(/_/g, ' ')}
                  {a.reason_detail && <> — {a.reason_detail}</>}
                </div>
                {a.critical_book_entry && (
                  <div className="mt-1 text-[10px] text-rose-300">
                    {t('reg.chain.promoted')} <span className="font-mono">{a.critical_book_entry}</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-600">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
