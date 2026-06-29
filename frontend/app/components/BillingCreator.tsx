'use client'

/**
 * BillingCreator — generate a bill for a lab request.
 *
 * On open you choose AUTO or MANUAL:
 *   • Auto   → items are pre-filled from the ordered tests (TestCatalog prices).
 *   • Manual → the same test-derived items are suggested (⭐) and selected first,
 *              then the whole catalogue is listed alphabetically to add more.
 * Submits to POST /api/v1/billing/quick (auto_confirm).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const PAYMENTS = ['CASH', 'INSURANCE', 'RSSB', 'MOMO', 'CREDIT'] as const

function authHeader(extra?: HeadersInit): HeadersInit {
  const tok = typeof window !== 'undefined'
    ? (document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token'))
    : null
  return { ...(extra || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }
}

type Item = { test_id: number | null; item_code: string; item_name: string; unit_price: number; quantity: number; is_auto_billed: boolean }
type CatItem = { test_id: number; item_code: string; item_name: string; unit_price: number; department?: string }

export default function BillingCreator({ labId, onClose, onCreated }: { labId: number; onClose: () => void; onCreated: () => void }) {
  const [mode, setMode]   = useState<'choose' | 'auto' | 'manual'>('choose')
  const [items, setItems] = useState<Item[]>([])
  const [suggestedIds, setSuggestedIds] = useState<Set<number>>(new Set())
  const [catalog, setCatalog] = useState<CatItem[]>([])
  const [query, setQuery] = useState('')
  const [payment, setPayment] = useState<string>('CASH')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  const fetchAutobill = useCallback(async (): Promise<Item[]> => {
    const r = await fetch(`${API}/api/v1/billing/autobill/${labId}`, { headers: authHeader() })
    if (!r.ok) throw new Error(`autobill HTTP ${r.status}`)
    const d = await r.json()
    return (d.items || []).map((it: any) => ({
      test_id: it.test_id ?? null, item_code: it.item_code || '', item_name: it.item_name,
      unit_price: Number(it.unit_price || 0), quantity: it.quantity || 1, is_auto_billed: true,
    }))
  }, [labId])

  const loadCatalog = useCallback(async (q: string) => {
    try {
      const r = await fetch(`${API}/api/v1/billing/search-items?q=${encodeURIComponent(q)}&limit=300`, { headers: authHeader() })
      if (r.ok) setCatalog(await r.json())
    } catch { /* ignore */ }
  }, [])

  async function startAuto() {
    setBusy(true); setErr('')
    try { setItems(await fetchAutobill()); setMode('auto') }
    catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  async function startManual() {
    setBusy(true); setErr('')
    try {
      const sug = await fetchAutobill()
      setItems(sug)
      setSuggestedIds(new Set(sug.map(s => s.test_id).filter((x): x is number => x != null)))
      await loadCatalog('')
      setMode('manual')
    } catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  // Debounced catalogue search (manual mode)
  useEffect(() => {
    if (mode !== 'manual') return
    const id = setTimeout(() => { void loadCatalog(query) }, 300)
    return () => clearTimeout(id)
  }, [query, mode, loadCatalog])

  const selectedIds = useMemo(() => new Set(items.map(i => i.test_id).filter(x => x != null)), [items])
  const total = useMemo(() => items.reduce((s, i) => s + i.unit_price * i.quantity, 0), [items])

  function toggle(c: CatItem) {
    setItems(prev => prev.some(i => i.test_id === c.test_id)
      ? prev.filter(i => i.test_id !== c.test_id)
      : [...prev, { test_id: c.test_id, item_code: c.item_code, item_name: c.item_name, unit_price: Number(c.unit_price || 0), quantity: 1, is_auto_billed: suggestedIds.has(c.test_id) }])
  }
  function setQty(idx: number, n: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, n) } : it))
  }
  function removeAt(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  async function create() {
    if (items.length === 0) { setErr('Add at least one item'); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API}/api/v1/billing/quick`, {
        method: 'POST', headers: authHeader({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ lab_request_id: labId, items, payment_method: payment, auto_confirm: true }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      onCreated(); onClose()
    } catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-700 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-slate-100">Generate bill — request #{labId}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
        {err && <div className="mb-3 rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">{err}</div>}

        {mode === 'choose' && (
          <div className="grid grid-cols-2 gap-3 py-4">
            <button onClick={startAuto} disabled={busy} className="rounded-xl border border-sky-600 bg-sky-600/15 p-5 hover:bg-sky-600/25 disabled:opacity-50">
              <div className="text-3xl">⚡</div>
              <div className="mt-1 font-semibold text-sky-200">Auto bill</div>
              <div className="text-[11px] text-slate-400">From ordered tests</div>
            </button>
            <button onClick={startManual} disabled={busy} className="rounded-xl border border-emerald-600 bg-emerald-600/15 p-5 hover:bg-emerald-600/25 disabled:opacity-50">
              <div className="text-3xl">✍️</div>
              <div className="mt-1 font-semibold text-emerald-200">Manual</div>
              <div className="text-[11px] text-slate-400">Suggested + pick more</div>
            </button>
          </div>
        )}

        {(mode === 'auto' || mode === 'manual') && (
          <>
            {/* Selected items */}
            <div className="rounded-lg border border-slate-700 divide-y divide-slate-800">
              {items.length === 0 && <div className="px-3 py-3 text-sm text-slate-500">No items selected.</div>}
              {items.map((it, idx) => (
                <div key={`${it.test_id}-${idx}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 text-slate-200">
                    {suggestedIds.has(it.test_id as number) && <span title="From ordered tests">⭐ </span>}
                    {it.item_name}
                  </span>
                  <input type="number" min={1} value={it.quantity} onChange={e => setQty(idx, Number(e.target.value))}
                         className="w-12 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-xs text-center text-slate-100" />
                  <span className="w-24 text-right text-slate-300">{(it.unit_price * it.quantity).toLocaleString()} RWF</span>
                  <button onClick={() => removeAt(idx)} className="text-rose-400 hover:text-rose-300">✕</button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-sm text-slate-400">Total</span>
              <span className="text-lg font-bold text-emerald-300">{total.toLocaleString()} RWF</span>
            </div>

            {/* Manual: catalogue (alphabetical) */}
            {mode === 'manual' && (
              <div className="mt-3">
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search catalogue (others, A→Z)…"
                       className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500" />
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-800">
                  {catalog.map(c => {
                    const on = selectedIds.has(c.test_id)
                    return (
                      <button key={c.test_id} onClick={() => toggle(c)}
                              className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-800 ${on ? 'bg-emerald-900/20' : ''}`}>
                        <span className="text-slate-200">
                          {suggestedIds.has(c.test_id) && '⭐ '}{c.item_name}
                          {c.department ? <span className="text-slate-500 text-xs"> · {c.department}</span> : null}
                        </span>
                        <span className="text-slate-400 text-xs">{Number(c.unit_price || 0).toLocaleString()} RWF {on ? '✓' : '＋'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Payment + create */}
            <div className="mt-3 flex items-center gap-2">
              <select value={payment} onChange={e => setPayment(e.target.value)}
                      className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100">
                {PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button onClick={() => setMode('choose')} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-100 text-sm">Back</button>
              <button onClick={create} disabled={busy || items.length === 0}
                      className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">
                {busy ? 'Creating…' : `Create bill (${total.toLocaleString()} RWF)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
