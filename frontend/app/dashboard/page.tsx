'use client'

/**
 * Main dashboard — the system's home screen.
 *
 * One coherent surface bringing together:
 *   - Welcome banner (military-green heading, golden tagline, PQC badge)
 *   - Live KPIs from /api/v1/dashboard/stats
 *   - Smart sample routing (barcode scan → multi-dept decision)
 *   - Quick-launch grid for the 7 voice-narrated demo scenes
 *   - Clinical module navigation (laboratory, patients, billing, etc.)
 *   - Recent activity feed from /api/v1/dashboard/activity-feed
 *
 * Header + footer come from AppShell so login -> dashboard -> any module
 * looks like one application, not stitched-together prototypes.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../contexts/AuthProvider'
import { useT } from '../contexts/I18nProvider'
import RequireAuth from '../components/RequireAuth'
import AppShell from '../components/AppShell'
import QuickPatientBar from '../components/QuickPatientBar'
import VoiceMic from '../components/VoiceMic'

const API         = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const NEXUS_BLUE  = '#0066CC'
const MIL_GREEN   = '#4B5320'
const MIL_GREEN_DK= '#3A4019'
const GOLD        = '#D4A017'
const GOLD_DK     = '#A6800F'

// ── Demo definitions ────────────────────────────────────────────────────────
// Module navigation is provided by the left sidebar (role-filtered); the
// dashboard no longer duplicates it, to keep the home screen uncluttered.

const TRAINING_SCENES = [
  { id: 'iot_analyzer_intake_demo',   title: 'IoT analyzer ingestion',  tag: 'Vendor-neutral',  icon: '⚡' },
  { id: 'lis_mapping_walkthrough',    title: 'OCR + LIS auto-mapping',  tag: 'OCR',             icon: '📄' },
  { id: 'specimen_intake_stat',       title: 'STAT specimen intake',    tag: 'Workflow',        icon: '🩺' },
  { id: 'critical_value_validation',  title: 'Critical CBC validation', tag: 'Auto-archive',    icon: '⚠️' },
  { id: 'medgenome_pcr_demo',         title: 'GeneXpert MTB / Rif',     tag: 'Genomic',         icon: '🧬' },
  { id: 'blood_bank_crossmatch_demo', title: 'Blood-bank crossmatch',   tag: 'Traceability',    icon: '🩸' },
  { id: 'momo_billing_demo',          title: 'MoMo payment + release',  tag: 'Billing',         icon: '💳' },
] as const


// ── Types ───────────────────────────────────────────────────────────────────

interface Stats {
  lab_requests: { today: number; week: number; pending: number; stat_today: number; validated_today: number }
  results:      { entered_today: number; critical_today: number }
  patients:     { total_active: number; registered_today: number }
  system:       { status: string; current_date: string; user_role: string }
}

interface FeedItem {
  id: number; lab_id: string; pid: string | null
  status: string; emergency_level: string
  department: string; timestamp: string | null
}

interface RoutingDecision {
  multi_dept: boolean
  tests: Array<{ id: string; name: string; department: string }>
  departments: string[]
  message?: string
  sample_id: string
}

// ── Page ────────────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <AppShell theme="dark">
        <DashboardInner />
      </AppShell>
    </RequireAuth>
  )
}

function DashboardInner() {
  const { user } = useAuth()
  const t = useT()

  const [stats,           setStats]           = useState<Stats | null>(null)
  const [feed,            setFeed]            = useState<FeedItem[]>([])
  const [scanId,          setScanId]          = useState('')
  const [isScanning,      setIsScanning]      = useState(false)
  const [routingDecision, setRoutingDecision] = useState<RoutingDecision | null>(null)

  // Load KPIs + activity feed (auth required)
  useEffect(() => {
    const tok = getToken()
    const headers: HeadersInit = tok ? { Authorization: `Bearer ${tok}` } : {}
    fetch(`${API}/api/v1/dashboard/stats`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => setStats(null))
    fetch(`${API}/api/v1/dashboard/activity-feed?limit=10`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(setFeed)
      .catch(() => setFeed([]))
  }, [])

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanId) return
    setIsScanning(true)
    try {
      const res  = await fetch(`/api/routing/scan/${scanId}`, { method: 'POST' })
      const data = await res.json()
      if (data.multi_dept) {
        setRoutingDecision({ ...data, sample_id: scanId })
      } else {
        alert(`Sample ${scanId} auto-routed successfully to ${data.departments?.[0] ?? 'lab'}`)
        setScanId('')
      }
    } catch {
      alert('Routing endpoint not reachable. Confirm the backend is up.')
    } finally {
      setIsScanning(false)
    }
  }

  const confirmRouting = async (mode: 'all' | 'manual' | 'cancel') => {
    if (!routingDecision) return
    try {
      const res = await fetch(`/api/routing/confirm`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sample_id: routingDecision.sample_id, mode }),
      })
      if (res.ok) {
        setRoutingDecision(null)
        setScanId('')
      }
    } catch {/* noop */}
  }

  return (
    <>
      {/* ── WELCOME BANNER (dark neo) ─────────────────────────────────── */}
      <section
        className="border-b"
        style={{
          borderColor: 'rgba(56, 189, 248, 0.18)',
          background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(56,189,248,0.06) 100%)',
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-7 text-center space-y-3">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <h1
                className="text-2xl sm:text-3xl font-extrabold tracking-wide"
                style={{
                  color: '#A6C97A',                     // brighter olive-green for dark BG
                  textShadow: '0 0 24px rgba(166,201,122,0.35), 0 1px 0 rgba(0,0,0,0.4)',
                }}
              >
                {t('dash.welcome', { name: (user?.first_name?.toUpperCase() || user?.username?.toUpperCase() || '') })}
              </h1>
              <VoiceMic />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <p
              className="text-lg sm:text-xl font-extrabold italic"
              style={{
                color: '#FFD970',
                textShadow: '0 0 18px rgba(255,217,112,0.35), 0 1px 0 rgba(0,0,0,0.4)',
              }}
            >
              {t('dash.tagline')}
            </p>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider"
              style={{
                background: 'linear-gradient(135deg, rgba(166,201,122,0.10) 0%, rgba(166,201,122,0.20) 100%)',
                color: '#C9E2A0',
                border: '1px solid rgba(166,201,122,0.45)',
                boxShadow: '0 0 18px rgba(166,201,122,0.10)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              {t('dash.pqc')}
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-8">

        {/* ── Quick patient workspace (replaces the old centre logo) ─────── */}
        <QuickPatientBar />

        {/* ── KPI tiles ──────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label={t('dash.kpi.requests')}  value={stats?.lab_requests.today ?? '—'}            accent={NEXUS_BLUE} hint={t('dash.kpi.this_week', { n: stats?.lab_requests.week ?? 0 })} />
          <KpiTile label={t('dash.kpi.validated')} value={stats?.lab_requests.validated_today ?? '—'} accent="#0F766E"     hint={t('dash.kpi.entered', { n: stats?.results.entered_today ?? 0 })} />
          <KpiTile label={t('dash.kpi.critical')}  value={stats?.results.critical_today ?? '—'}       accent="#B91C1C"     hint={t('dash.kpi.flags')} />
          <KpiTile label={t('dash.kpi.pending')}   value={stats?.lab_requests.pending ?? '—'}         accent="#B45309"     hint={t('dash.kpi.stat', { n: stats?.lab_requests.stat_today ?? 0 })} />
        </section>

        {/* ── AI briefing: what to do today + outbreak / critical alerts ─ */}
        <AIBriefing stats={stats} feed={feed} />

        {/* ── What you recently worked on ───────────────────────────────── */}
        <RecentActivity />

        {/* ── Smart sample routing ──────────────────────────────────────── */}
        <section className="rounded-xl border bg-slate-900/60 backdrop-blur p-5 shadow-sm" style={{ borderColor: `${NEXUS_BLUE}30` }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold tracking-wide text-sky-300">
              {t('dash.routing.title')}
            </h2>
            <span className="text-[11px] text-slate-400">{t('dash.routing.hint')}</span>
          </div>
          <form onSubmit={handleScan} className="flex gap-2">
            <input
              type="text"
              value={scanId}
              onChange={(e) => setScanId(e.target.value)}
              placeholder="Scan barcode or enter Sample ID (e.g. S-0042)"
              className="flex-1 bg-slate-800/80 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-400 outline-none"
            />
            <button
              disabled={isScanning || !scanId}
              className="px-5 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm hover:shadow disabled:opacity-50"
              style={{ background: NEXUS_BLUE }}
            >
              {isScanning ? 'Routing…' : 'Scan'}
            </button>
          </form>
        </section>

        {/* ── Demo scene grid ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-bold tracking-wide text-sky-300">
              {t('dash.demos.title')}
            </h2>
            <Link href="/modules/training" className="text-xs font-medium hover:underline text-sky-300">
              {t('dash.demos.all')}
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {TRAINING_SCENES.map(s => (
              <Link
                key={s.id}
                href={`/modules/training/${s.id}?demo=1`}
                className="group rounded-xl bg-slate-900/60 backdrop-blur border border-slate-700/60 p-3 transition-all hover:border-sky-400/60 hover:bg-slate-900/80"
                style={{ boxShadow: '0 0 14px rgba(56,189,248,0.05)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-2xl">{s.icon}</div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(166,201,122,0.15)', color: '#C9E2A0', border: '1px solid rgba(166,201,122,0.30)' }}>
                    {s.tag}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-100 group-hover:text-sky-300">{s.title}</div>
                <div className="text-[11px] text-slate-400 mt-1">Say &quot;Jorinova start&quot; to run</div>
              </Link>
            ))}
          </div>
        </section>

        {/* Module navigation lives in the left sidebar — not duplicated here. */}

        {/* ── Activity feed ─────────────────────────────────────────────── */}
        {feed.length > 0 && (
          <section className="rounded-xl border bg-slate-900/60 backdrop-blur p-5 shadow-sm" style={{ borderColor: `${NEXUS_BLUE}30` }}>
            <h2 className="text-sm font-bold tracking-wide mb-3 text-sky-300">
              {t('dash.recent')}
            </h2>
            <div className="space-y-1.5">
              {feed.map(f => (
                <div key={f.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 border-slate-700/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      f.emergency_level === 'stat'   ? 'bg-rose-400 animate-pulse' :
                      f.emergency_level === 'urgent' ? 'bg-amber-400' : 'bg-slate-500'
                    }`} />
                    <span className="font-mono text-xs text-slate-200">{f.lab_id}</span>
                    <span className="text-xs text-slate-400 truncate">PID {f.pid ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400">{f.status.replace('_', ' ')}</span>
                    <span className="text-[10px] text-slate-500">
                      {f.timestamp ? new Date(f.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Admin-only quick links ────────────────────────────────────── */}
        {user?.is_superuser && (
          <section className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-purple-700 mb-2">Admin</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href="/admin"                       className="text-purple-800 hover:underline">Admin dashboard</Link>
              <Link href="/security/voice-training/"    className="text-purple-800 hover:underline">Voice biometrics</Link>
              <Link href="/forgot-password"             className="text-purple-800 hover:underline">Reset a password</Link>
            </div>
          </section>
        )}
      </div>

      {/* ── Routing decision modal ──────────────────────────────────────── */}
      {routingDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-900">Multi-Department Routing Decision</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Sample <b>{routingDecision.sample_id}</b> requires intervention.
            </p>
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto border-y border-zinc-100 py-3">
              {routingDecision.tests.map(test => (
                <div key={test.id} className="flex justify-between text-xs p-2 bg-zinc-50 rounded border border-zinc-100">
                  <span className="font-medium">{test.name}</span>
                  <span className="font-bold uppercase" style={{ color: NEXUS_BLUE }}>{test.department}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-1 gap-2">
              <button onClick={() => confirmRouting('all')}
                      className="w-full text-white py-2 rounded-lg text-sm font-semibold"
                      style={{ background: NEXUS_BLUE }}>
                Route to all departments
              </button>
              <button onClick={() => confirmRouting('manual')}
                      className="w-full bg-white border border-zinc-300 py-2 rounded-lg text-sm font-medium">
                Select manually
              </button>
              <button onClick={() => confirmRouting('cancel')}
                      className="w-full text-zinc-500 py-2 text-sm font-medium hover:text-red-500">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


// ── Bits ────────────────────────────────────────────────────────────────────

// ── AI briefing widget ─────────────────────────────────────────────────────
// Reads the current dashboard stats + activity feed and surfaces the
// 3 most actionable things the user should do right now. Also flashes a
// red banner for any STAT request or critical-flagged result so a clinician
// can react immediately on opening the system.

function AIBriefing({
  stats, feed,
}: { stats: Stats | null; feed: FeedItem[] }) {
  const t = useT()
  const todos: { icon: string; text: string; href?: string }[] = []
  const statCount   = feed.filter(f => f.emergency_level === 'stat').length
  const urgentCount = feed.filter(f => f.emergency_level === 'urgent').length

  if (stats?.results.critical_today && stats.results.critical_today > 0) {
    const n = stats.results.critical_today
    todos.push({
      icon: '🚨',
      text: t('dash.briefing.criticals', { n, s: n > 1 ? 's' : '' }),
      href: '/modules/register',
    })
  }
  if (stats?.lab_requests.stat_today && stats.lab_requests.stat_today > 0) {
    const n = stats.lab_requests.stat_today
    todos.push({
      icon: '⚡',
      text: t('dash.briefing.stat', { n, s: n > 1 ? 's' : '' }),
      href: '/modules/laboratory',
    })
  }
  if (stats?.lab_requests.pending && stats.lab_requests.pending > 0) {
    const n = stats.lab_requests.pending
    todos.push({
      icon: '⏳',
      text: t('dash.briefing.pending', { n, s: n > 1 ? 's' : '' }),
      href: '/modules/laboratory',
    })
  }
  if (todos.length === 0) {
    todos.push({ icon: '✅', text: t('dash.briefing.allgood'), href: '/modules/register' })
  }

  const hasAlarm = statCount > 0 || (stats?.results.critical_today ?? 0) > 0

  return (
    <section
      className="rounded-xl border bg-slate-900/60 backdrop-blur p-5"
      style={{
        borderColor: hasAlarm ? 'rgba(220,38,38,0.55)' : 'rgba(56,189,248,0.30)',
        boxShadow:   hasAlarm ? '0 0 28px rgba(220,38,38,0.20)' : '0 0 22px rgba(56,189,248,0.08)',
      }}
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-bold tracking-wide flex items-center gap-2"
            style={{ color: hasAlarm ? '#FCA5A5' : '#7DD3FC' }}>
          <span className="text-xl">{hasAlarm ? '🚨' : '🤖'}</span>
          {t('dash.briefing.title')}
        </h2>
        {(statCount > 0 || urgentCount > 0) && (
          <div className="flex items-center gap-2 text-xs">
            {statCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 border border-rose-400/40 font-bold animate-pulse">
                {statCount} STAT
              </span>
            )}
            {urgentCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/40 font-bold">
                {urgentCount} URGENT
              </span>
            )}
          </div>
        )}
      </div>
      <ol className="space-y-2">
        {todos.map((item, i) => (
          <li key={i}>
            <Link
              href={item.href || '/dashboard'}
              className="flex items-start gap-3 rounded-lg px-3 py-2 bg-slate-800/50 border border-slate-700 hover:border-sky-400/50 hover:bg-slate-800/80 transition-colors"
            >
              <span className="text-lg leading-none mt-0.5">{item.icon}</span>
              <span className="flex-1 text-sm text-slate-200">{item.text}</span>
              <span className="text-slate-500 text-sm">→</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ── Recent activity — what THIS user last worked on (shown right after login) ─
interface ActivityItem { entity_type: string; action: string; entity_id: string | null; patient_pid: string | null; department: string | null; timestamp: string | null }

function RecentActivity() {
  const [items, setItems] = useState<ActivityItem[]>([])
  useEffect(() => {
    const tok = getToken()
    fetch(`${API}/api/v1/ops/recent-activity?limit=8`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
  }, [])
  if (items.length === 0) return null
  return (
    <section className="rounded-xl border bg-slate-900/60 backdrop-blur p-5" style={{ borderColor: 'rgba(56,189,248,0.30)' }}>
      <h2 className="text-sm font-bold tracking-wide mb-3 text-sky-300">↩ Continue where you left off</h2>
      <div className="space-y-1.5">
        {items.map((a, i) => (
          <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 border-slate-700/40">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] uppercase tracking-wider text-sky-300/80 font-semibold w-20 shrink-0">{a.action}</span>
              <span className="text-slate-200 truncate">{a.entity_type}{a.entity_id ? ` · ${a.entity_id}` : ''}{a.patient_pid ? ` · PID ${a.patient_pid}` : ''}</span>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">
              {a.timestamp ? new Date(a.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function KpiTile({
  label, value, accent, hint,
}: { label: string; value: string | number; accent: string; hint?: string }) {
  return (
    <div
      className="rounded-xl bg-slate-900/60 backdrop-blur p-4 border"
      style={{
        borderColor: `${accent}55`,
        boxShadow: `0 0 22px ${accent}1F, inset 0 0 0 1px ${accent}10`,
      }}
    >
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>
        {label}
      </div>
      <div className="text-3xl font-extrabold text-slate-100 mt-1" style={{ textShadow: `0 0 18px ${accent}55` }}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  )
}
