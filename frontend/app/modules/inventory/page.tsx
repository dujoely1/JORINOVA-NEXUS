'use client'

/**
 * Inventory module — reagent / consumable / PPE stock with low-stock
 * + expiry alerts, plus a stock-movement audit feed.
 *
 * Consumes:
 *   GET /api/v1/inventory/stats
 *   GET /api/v1/inventory/items?category=&low_stock=&expiring=&q=
 *   GET /api/v1/inventory/expiring?days=30
 *   GET /api/v1/inventory/movements?limit=50
 */

import { useEffect, useMemo, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import InventoryCharts from '../../components/InventoryCharts'
import InventoryExchange from '../../components/InventoryExchange'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface Stats {
  total_items: number; low_stock: number; out_of_stock: number
  expiring_30_days: number; total_value_rwf: number
  categories: Record<string, number>
}
interface Item {
  id: number; item_code: string; name: string; category: string; unit: string
  quantity: number; min_stock: number; unit_cost: number
  lot_number?: string | null; expiry_date?: string | null; location?: string | null
  stock_status: string; expiry_status: string; days_to_expiry?: number
}
interface Move {
  id: number; item_id: number; movement: string; quantity: number
  before: number; after: number; reason?: string; created_at: string
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit {
  const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function InventoryPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Inventory" theme="dark">
        <InventoryInner />
      </AppShell>
    </RequireAuth>
  )
}

function InventoryInner() {
  const t = useT()
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [items,    setItems]    = useState<Item[]>([])
  const [moves,    setMoves]    = useState<Move[]>([])
  const [cat,      setCat]      = useState('')
  const [q,        setQ]        = useState('')
  const [showLow,  setShowLow]  = useState(false)
  const [expiring, setExpiring] = useState(0)
  const [err,      setErr]      = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/api/v1/inventory/stats`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null).then(setStats).catch(() => {})
    fetch(`${API}/api/v1/inventory/movements?limit=20`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : []).then(setMoves).catch(() => {})
  }, [])

  useEffect(() => {
    const p = new URLSearchParams()
    if (cat) p.set('category', cat)
    if (q)   p.set('q', q)
    if (showLow) p.set('low_stock', 'true')
    if (expiring) p.set('expiring', String(expiring))
    p.set('limit', '300')
    fetch(`${API}/api/v1/inventory/items?${p.toString()}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setItems)
      .catch(e => setErr(String(e)))
  }, [cat, q, showLow, expiring])

  const categories = useMemo(() => Object.keys(stats?.categories || {}), [stats])

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(34,197,94,0.25)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(34,197,94,0.06) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-emerald-200" style={{ textShadow: '0 0 20px rgba(34,197,94,0.30)' }}>
            📦 {t('mod.inventory')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.inventory.sub')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Kpi label={t('inv.kpi.total')}     value={stats?.total_items ?? '—'}      accent="#22C55E" />
          <Kpi label={t('inv.kpi.low')}       value={stats?.low_stock ?? '—'}        accent="#F59E0B" hint={t('inv.kpi.low.h')} />
          <Kpi label={t('inv.kpi.out')}       value={stats?.out_of_stock ?? '—'}     accent="#DC2626" />
          <Kpi label={t('inv.kpi.expiring')}  value={stats?.expiring_30_days ?? '—'} accent="#A855F7" />
          <Kpi label={t('inv.kpi.value')}     value={stats ? stats.total_value_rwf.toLocaleString() : '—'} accent="#0066CC" />
        </div>

        {/* Smart Inventory — charts + inter-hospital exchange */}
        <InventoryCharts />
        <InventoryExchange />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900/60 border border-slate-700/60 p-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('inv.search')}
            className="flex-1 min-w-[200px] bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500" />
          <select value={cat} onChange={e => setCat(e.target.value)}
            className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100">
            <option value="">{t('inv.all_categories')}</option>
            {categories.map(c => <option key={c} value={c}>{c} ({stats?.categories[c]})</option>)}
          </select>
          <select value={expiring} onChange={e => setExpiring(Number(e.target.value))}
            className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100">
            <option value="0">{t('inv.exp.any')}</option>
            <option value="7">{t('inv.exp.7')}</option>
            <option value="30">{t('inv.exp.30')}</option>
            <option value="90">{t('inv.exp.90')}</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-300 px-2">
            <input type="checkbox" checked={showLow} onChange={e => setShowLow(e.target.checked)} />
            {t('inv.only_low')}
          </label>
          <span className="text-xs text-slate-400 font-mono ml-auto">{t('inv.items', { n: items.length })}</span>
        </div>

        {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">{err}</div>}

        {/* Items table */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2.5">{t('inv.h.code')}</th>
                  <th className="text-left px-3 py-2.5">{t('tbl.name')}</th>
                  <th className="text-left px-3 py-2.5">{t('inv.h.category')}</th>
                  <th className="text-right px-3 py-2.5">{t('inv.h.qty')}</th>
                  <th className="text-right px-3 py-2.5">{t('inv.h.min')}</th>
                  <th className="text-left px-3 py-2.5">{t('inv.h.stock')}</th>
                  <th className="text-left px-3 py-2.5">{t('inv.h.expiry')}</th>
                  <th className="text-left px-3 py-2.5">{t('inv.h.lot')}</th>
                  <th className="text-left px-3 py-2.5">{t('inv.h.location')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-mono text-slate-200 text-xs">{i.item_code}</td>
                    <td className="px-3 py-2 text-slate-100">{i.name}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{i.category}</td>
                    <td className="px-3 py-2 text-right font-bold text-slate-100">{i.quantity} <span className="text-slate-500 text-xs">{i.unit}</span></td>
                    <td className="px-3 py-2 text-right text-slate-400 text-xs">{i.min_stock}</td>
                    <td className="px-3 py-2"><StatusPill status={i.stock_status} /></td>
                    <td className="px-3 py-2 text-xs">
                      {i.expiry_date ? (
                        <span className={i.days_to_expiry !== undefined && i.days_to_expiry < 0 ? 'text-rose-400'
                          : i.days_to_expiry !== undefined && i.days_to_expiry <= 30 ? 'text-amber-400' : 'text-slate-300'}>
                          {i.expiry_date}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-400 text-xs">{i.lot_number || '—'}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{i.location || '—'}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">{t('inv.empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent movements */}
        {moves.length > 0 && (
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
            <h3 className="text-[11px] uppercase tracking-widest font-bold text-emerald-300 mb-2">{t('inv.movements')}</h3>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {moves.map(m => (
                <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border
                      ${m.movement === 'in'  ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'
                      : m.movement === 'out' ? 'text-rose-300 bg-rose-500/15 border-rose-400/30'
                      : 'text-slate-300 bg-slate-700/50 border-slate-500/30'}`}>{m.movement}</span>
                    <span className="font-mono text-slate-400">{t('inv.item_no')}{m.item_id}</span>
                    <span className="text-slate-200 font-semibold">{m.quantity}</span>
                    <span className="text-slate-500">({m.before} → {m.after})</span>
                  </div>
                  <div className="text-slate-500 text-[10px]">{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}

function Kpi({ label, value, accent, hint }: { label: string; value: any; accent: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-900/60 backdrop-blur p-4 border"
         style={{ borderColor: `${accent}55`, boxShadow: `0 0 22px ${accent}1F` }}>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>{label}</div>
      <div className="text-3xl font-extrabold text-slate-100 mt-1" style={{ textShadow: `0 0 18px ${accent}55` }}>{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const v = (status || '').toLowerCase()
  const color = v === 'ok' || v === 'available' ? 'emerald'
              : v === 'low' || v === 'warning' ? 'amber'
              : v === 'out' || v === 'critical' || v === 'expired' ? 'rose'
              : 'sky'
  const map = {
    emerald: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30',
    amber:   'text-amber-300 bg-amber-500/15 border-amber-400/30',
    rose:    'text-rose-300 bg-rose-500/15 border-rose-400/30',
    sky:     'text-sky-300 bg-sky-500/15 border-sky-400/30',
  } as const
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${map[color]}`}>{status}</span>
}
