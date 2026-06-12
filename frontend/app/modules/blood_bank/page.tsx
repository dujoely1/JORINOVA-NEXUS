'use client'

/**
 * Blood Bank module — donor registry, inventory by group/component,
 * pending requests, expiring units, haemovigilance feed.
 *
 * Consumes:
 *   GET /api/v1/blood-bank/stats
 *   GET /api/v1/blood-bank/blood-group-stock
 *   GET /api/v1/blood-bank/bags?status=available
 *   GET /api/v1/blood-bank/bags/expiring?days=7
 *   GET /api/v1/blood-bank/requests?status=pending
 *   GET /api/v1/blood-bank/donors?limit=200
 *   GET /api/v1/blood-bank/haemovigilance
 */

import { useEffect, useMemo, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface Stats {
  total_available_units: number
  expiring_within_7_days: number
  expired_in_stock: number
  pending_blood_requests: number
  total_donors: number
  eligible_donors: number
  reactions_last_30d: number
  stock_by_group: Record<string, number>
}
interface Bag { id: number; bag_number: string; blood_group: string; component: string; status: string; expiry_date: string; expiry_status: string; days_to_expiry: number; volume_ml: number }
interface Req { id: number; request_id: string; patient_name?: string; blood_group: string; component: string; units_requested: number; urgency: string; status: string; ward?: string }
interface Donor { id: number; donor_id: string; full_name: string; blood_group: string; gender: string; is_eligible: boolean; total_donations: number; last_donation?: string | null }
interface HV { id: number; report_id: string; reaction_type: string; severity: string; reported_at: string; patient_id: number }

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

type Tab = 'overview' | 'inventory' | 'requests' | 'donors' | 'haemovigilance'

export default function BloodBankPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Blood Bank" theme="dark">
        <BloodBankInner />
      </AppShell>
    </RequireAuth>
  )
}

function BloodBankInner() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('overview')
  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(220,38,38,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(220,38,38,0.08) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-rose-200" style={{ textShadow: '0 0 20px rgba(220,38,38,0.30)' }}>
            🩸 {t('mod.bloodbank')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.bloodbank.sub')}</p>
          <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-700/60 -mb-px">
            {([
              ['overview',       t('bb.tab.overview'), '📊'],
              ['inventory',      t('bb.tab.stock'),    '📦'],
              ['requests',       t('bb.tab.requests'), '📝'],
              ['donors',         t('bb.tab.donors'),   '👤'],
              ['haemovigilance', t('bb.tab.hv'),       '🚨'],
            ] as const).map(([k,l,i]) => {
              const on = tab === k
              return (
                <button key={k} onClick={() => setTab(k as Tab)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-2
                    ${on ? 'text-rose-300 border-rose-400 bg-slate-900/60' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
                  <span>{i}</span>{l}
                </button>
              )
            })}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
        {tab === 'overview'       && <OverviewTab />}
        {tab === 'inventory'      && <InventoryTab />}
        {tab === 'requests'       && <RequestsTab />}
        {tab === 'donors'         && <DonorsTab />}
        {tab === 'haemovigilance' && <HVTab />}
      </div>
    </>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewTab() {
  const t = useT()
  const [s, setS] = useState<Stats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch(`${API}/api/v1/blood-bank/stats`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setS)
      .catch(e => setErr(String(e)))
  }, [])

  if (err) return <Err msg={err} />
  if (!s)  return <Loading />

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label={t('bb.kpi.available')}   value={s.total_available_units}   accent="#DC2626" hint={t('bb.kpi.available.h')} />
        <Kpi label={t('bb.kpi.expiring')}    value={s.expiring_within_7_days}  accent="#F59E0B" hint={t('bb.kpi.expiring.h')} />
        <Kpi label={t('bb.kpi.pending')}     value={s.pending_blood_requests}  accent="#0066CC" hint={t('bb.kpi.pending.h')} />
        <Kpi label={t('bb.kpi.eligible')}    value={s.eligible_donors}         accent="#22C55E" hint={t('bb.kpi.eligible.h', { n: s.total_donors })} />
      </div>

      <Card title={t('bb.stock_by_group')} accent="#DC2626">
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => {
            const n = s.stock_by_group[g] || 0
            const low = n < 5
            return (
              <div key={g} className={`rounded-lg border px-2 py-2.5 text-center
                ${low ? 'border-amber-400/50 bg-amber-500/10' : 'border-slate-600 bg-slate-800/50'}`}>
                <div className={`text-xs font-bold ${low ? 'text-amber-300' : 'text-slate-300'}`}>{g}</div>
                <div className={`text-2xl font-extrabold mt-0.5 ${low ? 'text-amber-200' : 'text-slate-100'}`}>{n}</div>
                <div className="text-[10px] text-slate-500">{t('bb.units')}</div>
              </div>
            )
          })}
        </div>
      </Card>

      {s.expired_in_stock > 0 && (
        <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          ⚠ {t('bb.expired_warn', { n: s.expired_in_stock })}
        </div>
      )}
    </div>
  )
}

// ── Inventory ───────────────────────────────────────────────────────────────

function InventoryTab() {
  const t = useT()
  const [bags, setBags] = useState<Bag[]>([])
  const [err,  setErr]  = useState<string | null>(null)
  useEffect(() => {
    fetch(`${API}/api/v1/blood-bank/bags?status=available&limit=300`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setBags).catch(e => setErr(String(e)))
  }, [])
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('bb.h.bag'),t('bb.h.group'),t('bb.h.component'),t('bb.h.volume'),t('bb.h.expiry'),t('bb.h.days'),t('tbl.status')]}>
      {bags.map(b => (
        <tr key={b.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{b.bag_number}</td>
          <td className="px-3 py-2"><Pill text={b.blood_group} color="rose" /></td>
          <td className="px-3 py-2 text-slate-300">{b.component}</td>
          <td className="px-3 py-2 text-slate-300">{b.volume_ml} mL</td>
          <td className="px-3 py-2 text-slate-300">{b.expiry_date}</td>
          <td className={`px-3 py-2 font-bold ${b.days_to_expiry < 0 ? 'text-rose-400' : b.days_to_expiry <= 7 ? 'text-amber-400' : 'text-slate-300'}`}>
            {b.days_to_expiry}d
          </td>
          <td className="px-3 py-2"><StatusPill status={b.expiry_status} /></td>
        </tr>
      ))}
      {bags.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">{t('bb.empty.bags')}</td></tr>}
    </Table>
  )
}

// ── Requests ────────────────────────────────────────────────────────────────

function RequestsTab() {
  const t = useT()
  const [reqs, setReqs] = useState<Req[]>([])
  const [err,  setErr]  = useState<string | null>(null)
  useEffect(() => {
    fetch(`${API}/api/v1/blood-bank/requests?limit=200`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setReqs).catch(e => setErr(String(e)))
  }, [])
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('bb.h.request'),t('tbl.patient'),t('bb.h.group'),t('bb.h.component'),t('bb.h.units'),t('bb.h.urgency'),t('bb.h.ward'),t('tbl.status')]}>
      {reqs.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.request_id}</td>
          <td className="px-3 py-2 text-slate-300">{r.patient_name || '—'}</td>
          <td className="px-3 py-2"><Pill text={r.blood_group} color="rose" /></td>
          <td className="px-3 py-2 text-slate-300">{r.component}</td>
          <td className="px-3 py-2 text-slate-200 font-bold">{r.units_requested}</td>
          <td className="px-3 py-2">
            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border
              ${r.urgency==='stat' ? 'text-rose-300 bg-rose-500/15 border-rose-400/30 animate-pulse'
              : r.urgency==='urgent' ? 'text-amber-300 bg-amber-500/15 border-amber-400/30'
              : 'text-slate-300 bg-slate-700/50 border-slate-500/30'}`}>{r.urgency}</span>
          </td>
          <td className="px-3 py-2 text-slate-400 text-xs">{r.ward || '—'}</td>
          <td className="px-3 py-2"><StatusPill status={r.status} /></td>
        </tr>
      ))}
      {reqs.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">{t('bb.empty.requests')}</td></tr>}
    </Table>
  )
}

// ── Donors ──────────────────────────────────────────────────────────────────

function DonorsTab() {
  const t = useT()
  const [rows, setRows] = useState<Donor[]>([])
  const [query, setQuery] = useState('')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch(`${API}/api/v1/blood-bank/donors?limit=300`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setRows).catch(e => setErr(String(e)))
  }, [])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(d => d.full_name.toLowerCase().includes(q) || d.donor_id.toLowerCase().includes(q) || d.blood_group.toLowerCase().includes(q))
  }, [rows, query])
  if (err) return <Err msg={err} />
  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('bb.search_donors')}
        className="mb-3 bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 w-full sm:w-80" />
      <Table headers={[t('bb.h.donor_id'),t('tbl.name'),t('bb.h.group'),t('bb.h.donations'),t('bb.h.last_donation'),t('bb.h.eligibility')]}>
        {filtered.map(d => (
          <tr key={d.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
            <td className="px-3 py-2 font-mono text-slate-200">{d.donor_id}</td>
            <td className="px-3 py-2 text-slate-200">{d.full_name}</td>
            <td className="px-3 py-2"><Pill text={d.blood_group} color="rose" /></td>
            <td className="px-3 py-2 text-slate-300">{d.total_donations}</td>
            <td className="px-3 py-2 text-slate-400 text-xs">{d.last_donation || t('bb.never')}</td>
            <td className="px-3 py-2">
              {d.is_eligible
                ? <Pill text={t('bb.eligible')} color="emerald" />
                : <Pill text={t('bb.deferred')} color="amber" />}
            </td>
          </tr>
        ))}
        {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">{t('bb.empty.donors')}</td></tr>}
      </Table>
    </>
  )
}

// ── Haemovigilance ──────────────────────────────────────────────────────────

function HVTab() {
  const t = useT()
  const [rows, setRows] = useState<HV[]>([])
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch(`${API}/api/v1/blood-bank/haemovigilance?limit=100`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setRows).catch(e => setErr(String(e)))
  }, [])
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('bb.h.report'),t('bb.h.reaction'),t('micro.h.severity'),t('tbl.patient'),t('bb.h.reported')]}>
      {rows.map(r => (
        <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{r.report_id}</td>
          <td className="px-3 py-2 text-slate-200">{r.reaction_type}</td>
          <td className="px-3 py-2">
            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border
              ${r.severity==='fatal' || r.severity==='severe' ? 'text-rose-300 bg-rose-500/15 border-rose-400/30'
              : r.severity==='moderate' ? 'text-amber-300 bg-amber-500/15 border-amber-400/30'
              : 'text-slate-300 bg-slate-700/50 border-slate-500/30'}`}>{r.severity}</span>
          </td>
          <td className="px-3 py-2 font-mono text-slate-400">PID {r.patient_id}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{new Date(r.reported_at).toLocaleString()}</td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">{t('bb.empty.hv')}</td></tr>}
    </Table>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function Kpi({ label, value, accent, hint }: { label: string; value: number; accent: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-900/60 backdrop-blur p-4 border"
         style={{ borderColor: `${accent}55`, boxShadow: `0 0 22px ${accent}1F` }}>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>{label}</div>
      <div className="text-3xl font-extrabold text-slate-100 mt-1" style={{ textShadow: `0 0 18px ${accent}55` }}>{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  )
}

function Card({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-slate-900/60 backdrop-blur p-4"
             style={{ borderColor: `${accent}40` }}>
      <h3 className="text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: accent }}>{title}</h3>
      {children}
    </section>
  )
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
            <tr>{headers.map(h => <th key={h} className="text-left px-3 py-2.5">{h}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}

function Pill({ text, color }: { text: string; color: 'rose'|'emerald'|'amber'|'sky' }) {
  const map = {
    rose:    'text-rose-300 bg-rose-500/15 border-rose-400/30',
    emerald: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30',
    amber:   'text-amber-300 bg-amber-500/15 border-amber-400/30',
    sky:     'text-sky-300 bg-sky-500/15 border-sky-400/30',
  }
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${map[color]}`}>{text}</span>
}

function StatusPill({ status }: { status: string }) {
  const v = status.toLowerCase()
  const color = v === 'available' || v === 'ok' ? 'emerald'
              : v === 'expired' || v === 'critical' || v === 'rejected' ? 'rose'
              : v === 'warning' || v === 'reserved' || v === 'pending' || v === 'crossmatch' ? 'amber'
              : 'sky'
  return <Pill text={status} color={color as any} />
}

function Loading() { return <div className="text-sm text-slate-400 px-3 py-10 text-center">Loading…</div> }
function Err({ msg }: { msg: string }) {
  return <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-4 py-3 text-sm text-rose-200">⚠ {msg}</div>
}
