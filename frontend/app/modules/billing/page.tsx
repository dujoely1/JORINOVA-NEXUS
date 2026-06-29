'use client'

/**
 * Billing module — today's totals by status + lab-request lookup.
 *
 * Consumes:
 *   GET /api/v1/billing/summary/today
 *   GET /api/v1/billing/record/{lab_request_id}
 *   GET /api/v1/billing/lab-request/{lab_request_id}
 */

import { useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import BillingCreator from '../../components/BillingCreator'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface Summary {
  date: string; currency: string
  by_status: Record<string, { count: number; amount: number }>
  total_confirmed: number; total_paid: number
}

interface BillingItem { id: number; item_name: string; quantity: number; unit_price: number; total_price: number; is_waived: boolean }
interface BillingRecord {
  id: number; lab_request_id: number; status: string; payment_method?: string
  subtotal_amount: number; discount_amount: number; total_amount: number
  currency: string; insurance_name?: string; momo_ref?: string
  items: BillingItem[]; notes?: string
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit {
  const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function BillingPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Billing" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [labId,   setLabId]   = useState('')
  const [record,  setRecord]  = useState<BillingRecord | null>(null)
  const [err,     setErr]     = useState<string | null>(null)
  const [busy,    setBusy]    = useState(false)
  const [showCreator, setShowCreator] = useState(false)

  const refreshSummary = () => {
    fetch(`${API}/api/v1/billing/summary/today`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null).then(d => d && setSummary(d)).catch(() => {})
  }

  useEffect(() => {
    fetch(`${API}/api/v1/billing/summary/today`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setSummary)
      .catch(e => setErr(String(e)))
  }, [])

  async function loadRecord(id: string) {
    if (!id) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`${API}/api/v1/billing/record/${id}`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setRecord(await r.json())
    } catch (e: any) {
      setErr(String(e.message || e))
    } finally { setBusy(false) }
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    setRecord(null)
    await loadRecord(labId)
  }

  const fmt = (n: number) => n.toLocaleString() + ' RWF'

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(212,160,23,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(212,160,23,0.06) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-amber-200" style={{ textShadow: '0 0 20px rgba(212,160,23,0.30)' }}>
            💳 {t('mod.billing')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.billing.sub')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 space-y-5">
        {/* Today's totals */}
        <section>
          <h2 className="text-sm font-bold tracking-wide mb-3 text-amber-300">{t('bill.today')} · {summary?.date || '—'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label={t('bill.confirmed')}  value={summary ? fmt(summary.total_confirmed) : '—'} accent="#D4A017" />
            <Kpi label={t('bill.paid')}       value={summary ? fmt(summary.total_paid)      : '—'} accent="#22C55E" />
            <Kpi label={t('bill.draft')}      value={summary?.by_status?.DRAFT?.count ?? '—'}      accent="#64748B" hint={summary ? fmt(summary?.by_status?.DRAFT?.amount || 0) : ''} />
            <Kpi label={t('bill.cancelled')}  value={summary?.by_status?.CANCELLED?.count ?? '—'}  accent="#DC2626" />
          </div>
        </section>

        {/* Status breakdown */}
        {summary && Object.keys(summary.by_status).length > 0 && (
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
            <h3 className="text-[11px] uppercase tracking-widest font-bold text-amber-300 mb-2">{t('bill.breakdown')}</h3>
            <div className="space-y-1.5">
              {Object.entries(summary.by_status).map(([st, v]) => (
                <div key={st} className="flex items-center justify-between text-sm py-1 border-b border-slate-800/60 last:border-0">
                  <span className="font-mono uppercase tracking-wider text-xs text-slate-200">{st}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-slate-400 text-xs">{t('bill.records', { n: v.count })}</span>
                    <span className="font-bold text-amber-200">{fmt(v.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Lookup */}
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <h3 className="text-[11px] uppercase tracking-widest font-bold text-sky-300 mb-2">{t('bill.lookup_title')}</h3>
          <form onSubmit={lookup} className="flex gap-2">
            <input value={labId} onChange={e => setLabId(e.target.value)}
              placeholder={t('bill.lookup_ph')}
              className="flex-1 bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100" />
            <button disabled={busy || !labId} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-semibold text-sm disabled:opacity-50">
              {busy ? t('bill.looking') : t('bill.lookup')}
            </button>
            <button type="button" disabled={!labId} onClick={() => setShowCreator(true)}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 whitespace-nowrap">
              ⚡ Generate bill
            </button>
          </form>
          {err && <div className="mt-3 text-xs text-rose-300">⚠ {err}</div>}

          {record && (
            <div className="mt-4 rounded-lg border border-slate-700/60 bg-slate-800/40 p-3">
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <span className="text-lg font-bold text-amber-200">{fmt(record.total_amount)}</span>
                  <span className="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-slate-700/50 text-slate-300 border-slate-500/30">
                    {record.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {t('bill.lab_no')}{record.lab_request_id} · {record.payment_method || t('bill.no_method')}
                </div>
              </div>
              {record.insurance_name && <div className="text-xs text-slate-400">{t('bill.insurance')} <span className="text-slate-200">{record.insurance_name}</span></div>}
              {record.momo_ref && <div className="text-xs text-slate-400">{t('bill.momo_ref')} <span className="font-mono text-slate-200">{record.momo_ref}</span></div>}
              <div className="mt-2 divide-y divide-slate-700/60">
                {record.items.map(it => (
                  <div key={it.id} className="flex items-center justify-between py-1.5 text-xs">
                    <span className={`${it.is_waived ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                      {it.item_name} <span className="text-slate-500">×{it.quantity}</span>
                    </span>
                    <span className={`font-mono ${it.is_waived ? 'text-slate-500' : 'text-amber-200'}`}>{fmt(it.total_price)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-end gap-4 text-xs">
                <span className="text-slate-400">{t('bill.subtotal')} <span className="text-slate-200 ml-1">{fmt(record.subtotal_amount)}</span></span>
                {record.discount_amount > 0 && (
                  <span className="text-slate-400">{t('bill.discount')} <span className="text-rose-300 ml-1">−{fmt(record.discount_amount)}</span></span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {showCreator && labId && !Number.isNaN(Number(labId)) && (
        <BillingCreator
          labId={Number(labId)}
          onClose={() => setShowCreator(false)}
          onCreated={() => { refreshSummary(); void loadRecord(labId) }}
        />
      )}
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
