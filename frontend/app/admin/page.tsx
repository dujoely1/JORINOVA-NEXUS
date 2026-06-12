'use client'

/**
 * Admin dashboard — system-wide command surface for super_admin / it_admin
 * / lab_manager roles.
 *
 * Five tabs, all wired to live backend endpoints under /api/v1/admin/*:
 *   • Overview  → /admin/stats, /admin/modules (summary cards)
 *   • Users     → /admin/users  + role / active toggle + photo upload
 *   • Modules   → /admin/modules (full health grid)
 *   • Security  → /admin/2fa/setup → verify → disable
 *   • System    → version / DB stats / audit counters
 *
 * Same dark neo theme as /dashboard so the two screens feel like one app.
 * Forbidden if the logged-in user lacks an admin role.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../contexts/AuthProvider'
import RequireAuth from '../components/RequireAuth'
import AppShell from '../components/AppShell'
import { useT } from '../contexts/I18nProvider'

const API        = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const NEXUS_BLUE = '#0066CC'
const ADMIN_ROLES = new Set(['super_admin', 'it_admin', 'lab_manager'])

// ── Types ──────────────────────────────────────────────────────────────────

interface SystemStats {
  system:   { status: string; uptime: string; version: string; date: string; db_tables: string }
  lab:      { total_requests: number; today_requests: number; pending: number; validated_today: number; critical_today: number; rejections_today: number }
  patients: { total_active: number; registered_today: number }
  users:    { total_active: number }
  audit:    { entries_today: number }
}

interface AdminUser {
  id:           number
  username:     string
  email:        string | null
  first_name:   string | null
  last_name:    string | null
  role:         string
  is_active:    boolean
  is_superuser: boolean
  department:   string | null
  hospital_id:  number | null
  has_2fa:      boolean
  photo_url:    string | null
}

interface ModuleHealth {
  name:   string
  status: string
  route:  string
}

interface TwoFASetup {
  secret:   string
  qr_code:  string | null
  uri:      string
  message:  string
}

type Tab = 'overview' | 'users' | 'modules' | 'security' | 'system'

// ── Helpers ────────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const tok = getToken()
  return { ...(extra || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }
}

const ROLE_OPTIONS = [
  'super_admin', 'it_admin', 'lab_manager', 'scientist', 'lab_technician',
  'pathologist', 'doctor', 'nurse', 'receptionist', 'rbc_admin', 'patient',
] as const

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Admin Console" theme="dark">
        <AdminGate />
      </AppShell>
    </RequireAuth>
  )
}

function AdminGate() {
  const { user } = useAuth()
  const t = useT()
  const allowed = !!user && (user.is_superuser || ADMIN_ROLES.has(user.role || ''))

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <div className="text-5xl mb-3">🛑</div>
        <h1 className="text-2xl font-bold text-slate-100">{t('adm.no_access')}</h1>
        <p className="text-sm text-slate-400 mt-2">
          {t('adm.no_access_body', { role: user?.role ?? '—' })}
        </p>
        <Link href="/dashboard" className="inline-block mt-6 text-sky-300 hover:underline text-sm">
          {t('adm.back_dashboard')}
        </Link>
      </div>
    )
  }

  return <AdminInner />
}

function AdminInner() {
  const { user } = useAuth()
  const tr = useT()
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <>
      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <section
        className="border-b"
        style={{
          borderColor: 'rgba(168,85,247,0.25)',
          background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(168,85,247,0.08) 100%)',
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest"
                  style={{
                    background: 'rgba(168,85,247,0.15)',
                    color: '#D8B4FE',
                    border: '1px solid rgba(168,85,247,0.45)',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  {tr('adm.administrator')}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">{user?.username}</span>
              </div>
              <h1
                className="text-2xl sm:text-3xl font-extrabold tracking-wide mt-2"
                style={{ color: '#E9D5FF', textShadow: '0 0 22px rgba(216,180,254,0.30)' }}
              >
                {tr('adm.title')}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {tr('adm.subtitle')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/forgot-password"
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800/70 text-slate-200 border border-slate-600 hover:bg-slate-800"
              >
                {tr('adm.reset_pw')}
              </Link>
              <Link
                href="/dashboard"
                className="px-3 py-2 rounded-lg text-xs font-semibold border"
                style={{ background: 'rgba(56,189,248,0.10)', color: '#7DD3FC', borderColor: 'rgba(56,189,248,0.40)' }}
              >
                {tr('adm.dashboard')}
              </Link>
            </div>
          </div>

          {/* ── Tab nav ─────────────────────────────────────────────────── */}
          <nav className="mt-5 flex flex-wrap gap-1 border-b border-slate-700/60 -mb-px">
            {([
              { key: 'overview', label: tr('adm.tab.overview'), icon: '📊' },
              { key: 'users',    label: tr('adm.tab.users'),    icon: '👥' },
              { key: 'modules',  label: tr('adm.tab.modules'),  icon: '🧩' },
              { key: 'security', label: tr('adm.tab.security'), icon: '🔐' },
              { key: 'system',   label: tr('adm.tab.system'),   icon: '🖥️' },
            ] as const).map(t => {
              const on = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-2
                    ${on
                      ? 'text-sky-300 border-sky-400 bg-slate-900/60'
                      : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'}`}
                >
                  <span>{t.icon}</span>{t.label}
                </button>
              )
            })}
          </nav>
        </div>
      </section>

      {/* ── Tab panels ──────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users'    && <UsersTab />}
        {tab === 'modules'  && <ModulesTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'system'   && <SystemTab />}
      </div>
    </>
  )
}

// ── Overview tab ───────────────────────────────────────────────────────────

function OverviewTab() {
  const t = useT()
  const [stats,   setStats]   = useState<SystemStats | null>(null)
  const [modules, setModules] = useState<ModuleHealth[]>([])
  const [err,     setErr]     = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/v1/admin/stats`,   { headers: authHeaders() }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/v1/admin/modules`, { headers: authHeaders() }).then(r => r.ok ? r.json() : { modules: [] }),
    ])
      .then(([s, m]) => { setStats(s); setModules(m?.modules ?? []) })
      .catch(()       => setErr(t('adm.err.telemetry')))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const operational = modules.filter(m => m.status === 'operational').length
  const degraded    = modules.length - operational

  return (
    <div className="space-y-6">
      {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-4 py-2 text-sm text-rose-200">{err}</div>}

      {/* KPI tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t('adm.kpi.users')}     value={stats?.users.total_active ?? '—'}    accent="#A855F7" hint={t('adm.kpi.users.h')} />
        <Kpi label={t('adm.kpi.patients')}  value={stats?.patients.total_active ?? '—'} accent={NEXUS_BLUE} hint={t('adm.kpi.patients.h', { n: stats?.patients.registered_today ?? 0 })} />
        <Kpi label={t('adm.kpi.requests')}  value={stats?.lab.today_requests ?? '—'}    accent="#0F766E" hint={t('adm.kpi.requests.h', { n: stats?.lab.total_requests ?? 0 })} />
        <Kpi label={t('adm.kpi.critical')}  value={stats?.lab.critical_today ?? '—'}    accent="#B91C1C" hint={t('adm.kpi.critical.h', { n: stats?.lab.rejections_today ?? 0 })} />
      </section>

      {/* System + module summary cards */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card title={t('adm.c.sys_status')} accent="#22C55E">
          <Row k={t('adm.r.status')}      v={<span className="text-emerald-300 font-semibold uppercase">{stats?.system.status ?? t('adm.operational')}</span>} />
          <Row k={t('adm.r.version')}     v={<span className="font-mono">{stats?.system.version ?? '—'}</span>} />
          <Row k={t('adm.r.db_tables')}   v={stats?.system.db_tables ?? '—'} />
          <Row k={t('adm.r.server_date')} v={<span className="font-mono">{stats?.system.date ?? '—'}</span>} />
        </Card>

        <Card title={t('adm.c.mod_health')} accent="#38BDF8">
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-extrabold text-emerald-300">{operational}</div>
            <div className="text-xs text-slate-400">{t('adm.of_operational', { n: modules.length })}</div>
          </div>
          {degraded > 0 && (
            <div className="mt-2 text-xs text-amber-300">⚠ {t('adm.need_attention', { n: degraded })}</div>
          )}
          <div className="mt-3 grid grid-cols-6 gap-1">
            {modules.slice(0, 24).map(m => (
              <span
                key={m.name}
                title={`${m.name} — ${m.status}`}
                className={`h-2.5 rounded-sm ${m.status === 'operational' ? 'bg-emerald-400/80' : 'bg-amber-400/80'}`}
              />
            ))}
          </div>
        </Card>

        <Card title={t('adm.c.activity')} accent="#D4A017">
          <Row k={t('adm.r.lab_requests')} v={stats?.lab.today_requests ?? 0} />
          <Row k={t('adm.r.validated')}    v={stats?.lab.validated_today ?? 0} />
          <Row k={t('adm.r.pending')}      v={stats?.lab.pending ?? 0} />
          <Row k={t('adm.r.audit')}        v={stats?.audit.entries_today ?? 0} />
          <Row k={t('adm.r.new_patients')} v={stats?.patients.registered_today ?? 0} />
        </Card>
      </section>

      {/* Quick admin actions */}
      <section>
        <h2 className="text-sm font-bold tracking-wide mb-3 text-sky-300">{t('adm.quick_actions')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <QuickAction href="/security/voice-training/" icon="🎙️" label={t('adm.qa.voice')}   desc={t('adm.qa.voice.d')} />
          <QuickAction href="/forgot-password"          icon="🔑" label={t('adm.qa.reset')}   desc={t('adm.qa.reset.d')} />
          <QuickAction href="/install"                  icon="⚙️" label={t('adm.qa.install')} desc={t('adm.qa.install.d')} />
          <QuickAction href="/modules/audit"            icon="📋" label={t('adm.qa.audit')}   desc={t('adm.qa.audit.d')} />
        </div>
      </section>
    </div>
  )
}

// ── Users tab ──────────────────────────────────────────────────────────────

function UsersTab() {
  const t = useT()
  const [rows,    setRows]    = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [query,   setQuery]   = useState('')
  const [roleF,   setRoleF]   = useState<string>('')
  const [showInactive, setShowInactive] = useState(false)
  const [busy,    setBusy]    = useState<number | null>(null)
  const [err,     setErr]     = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`${API}/api/v1/admin/users?active_only=${!showInactive}&limit=500`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setRows)
      .catch(e => setErr(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [showInactive])

  useEffect(load, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(u => {
      if (roleF && u.role !== roleF) return false
      if (!q) return true
      return (
        u.username.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        ((u.first_name || '') + ' ' + (u.last_name || '')).toLowerCase().includes(q)
      )
    })
  }, [rows, query, roleF])

  async function changeRole(u: AdminUser, role: string) {
    setBusy(u.id)
    try {
      const r = await fetch(`${API}/api/v1/admin/users/${u.id}/role?role=${encodeURIComponent(role)}`, {
        method: 'PATCH', headers: authHeaders(),
      })
      if (!r.ok) throw new Error(await r.text())
      setRows(rs => rs.map(x => x.id === u.id ? { ...x, role } : x))
    } catch (e: any) {
      setErr(t('adm.err.role', { e: e.message || e }))
    } finally {
      setBusy(null)
    }
  }

  async function toggleActive(u: AdminUser) {
    if (!confirm(u.is_active ? t('adm.confirm.deact', { user: u.username }) : t('adm.confirm.react', { user: u.username }))) return
    setBusy(u.id)
    try {
      const r = await fetch(`${API}/api/v1/admin/users/${u.id}/toggle-active`, {
        method: 'PATCH', headers: authHeaders(),
      })
      if (!r.ok) throw new Error(await r.text())
      setRows(rs => rs.map(x => x.id === u.id ? { ...x, is_active: !x.is_active } : x))
    } catch (e: any) {
      setErr(t('adm.err.toggle', { e: e.message || e }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-4 py-2 text-sm text-rose-200">{err}</div>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900/60 border border-slate-700/60 p-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('adm.search_users')}
          className="flex-1 min-w-[220px] bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-400 outline-none"
        />
        <select
          value={roleF}
          onChange={e => setRoleF(e.target.value)}
          className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
        >
          <option value="">{t('adm.all_roles')}</option>
          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-300 px-2">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          {t('adm.include_inactive')}
        </label>
        <button
          onClick={load}
          className="ml-auto px-3 py-2 text-xs rounded-lg bg-sky-600/80 text-white font-semibold hover:bg-sky-600"
        >
          {t('common.refresh')}
        </button>
        <span className="text-xs text-slate-400 font-mono px-1">
          {filtered.length}/{rows.length}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5">{t('adm.h.user')}</th>
                <th className="text-left px-4 py-2.5">{t('adm.h.email')}</th>
                <th className="text-left px-4 py-2.5">{t('adm.h.role')}</th>
                <th className="text-left px-4 py-2.5">{t('adm.h.dept')}</th>
                <th className="text-center px-4 py-2.5">2FA</th>
                <th className="text-center px-4 py-2.5">{t('tbl.status')}</th>
                <th className="text-right px-4 py-2.5">{t('adm.h.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">{t('adm.loading_users')}</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">{t('adm.no_users')}</td></tr>
              )}
              {!loading && filtered.map(u => {
                const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username
                const initial = name.charAt(0).toUpperCase()
                const isBusy = busy === u.id
                return (
                  <tr key={u.id} className="border-t border-slate-800/80 hover:bg-slate-800/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {u.photo_url ? (
                          <img src={u.photo_url} alt="" className="h-8 w-8 rounded-full object-cover border border-slate-600" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center border border-slate-600">
                            {initial}
                          </div>
                        )}
                        <div className="leading-tight">
                          <div className="text-slate-100 font-medium">{name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">@{u.username}{u.is_superuser ? ` · ${t('adm.superuser')}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300 text-xs">{u.email || '—'}</td>
                    <td className="px-4 py-2.5">
                      <select
                        disabled={isBusy}
                        value={u.role}
                        onChange={e => changeRole(u, e.target.value)}
                        className="bg-slate-800/80 border border-slate-600 rounded-md px-2 py-1 text-xs text-slate-100 focus:ring-1 focus:ring-sky-400 outline-none"
                      >
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        {/* keep an unknown role visible */}
                        {!ROLE_OPTIONS.includes(u.role as any) && (
                          <option value={u.role}>{u.role}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{u.department || '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      {u.has_2fa
                        ? <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-300">{t('adm.enabled')}</span>
                        : <span className="text-[10px] uppercase tracking-wider text-slate-500">{t('adm.off')}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold
                        ${u.is_active
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                          : 'bg-rose-500/15 text-rose-300 border border-rose-400/30'}`}>
                        {u.is_active ? t('adm.active') : t('adm.inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <PhotoUploader uid={u.id} onUploaded={url => setRows(rs => rs.map(x => x.id === u.id ? { ...x, photo_url: url } : x))} />
                      <button
                        disabled={isBusy}
                        onClick={() => toggleActive(u)}
                        className={`ml-2 px-2.5 py-1 text-xs rounded-md font-semibold border
                          ${u.is_active
                            ? 'bg-rose-500/10 text-rose-300 border-rose-400/30 hover:bg-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/20'}`}
                      >
                        {u.is_active ? t('adm.deactivate') : t('adm.activate')}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PhotoUploader({ uid, onUploaded }: { uid: number; onUploaded: (url: string) => void }) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`${API}/api/v1/admin/users/${uid}/photo`, {
        method: 'POST',
        headers: authHeaders(),  // do NOT set Content-Type — let the browser add the boundary
        body: fd,
      })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      onUploaded(j.photo_url)
    } catch (err: any) {
      alert(t('adm.err.upload', { e: err.message || err }))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={pick} />
      <button
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="px-2.5 py-1 text-xs rounded-md font-semibold border bg-slate-800/80 text-slate-200 border-slate-600 hover:bg-slate-800"
      >
        {busy ? t('adm.uploading') : t('adm.photo')}
      </button>
    </>
  )
}

// ── Modules tab ────────────────────────────────────────────────────────────

function ModulesTab() {
  const t = useT()
  const [modules, setModules] = useState<ModuleHealth[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/v1/admin/modules`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { modules: [] })
      .then(j => setModules(j.modules ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-slate-400 text-sm">{t('adm.loading_modules')}</div>

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {modules.map(m => {
        const ok = m.status === 'operational'
        return (
          <div
            key={m.name}
            className="rounded-xl border bg-slate-900/60 backdrop-blur p-4"
            style={{
              borderColor: ok ? 'rgba(34,197,94,0.30)' : 'rgba(245,158,11,0.40)',
              boxShadow:   ok ? '0 0 16px rgba(34,197,94,0.10)' : '0 0 16px rgba(245,158,11,0.12)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-100">{m.name}</div>
              <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full
                ${ok ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                     : 'bg-amber-500/15 text-amber-300 border border-amber-400/30'}`}>
                {ok ? t('adm.mod_operational') : m.status}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-1">{m.route}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Security tab — 2FA setup ───────────────────────────────────────────────

function SecurityTab() {
  const { user } = useAuth()
  const t = useT()
  const [setup, setSetup]   = useState<TwoFASetup | null>(null)
  const [otp,   setOtp]     = useState('')
  const [msg,   setMsg]     = useState<string | null>(null)
  const [err,   setErr]     = useState<string | null>(null)
  const [busy,  setBusy]    = useState(false)

  async function startSetup() {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const r = await fetch(`${API}/api/v1/admin/2fa/setup`, { method: 'POST', headers: authHeaders() })
      if (!r.ok) throw new Error(await r.text())
      setSetup(await r.json())
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }

  async function verifyOtp() {
    if (!setup || !otp) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`${API}/api/v1/admin/2fa/verify?otp=${encodeURIComponent(otp)}&secret=${encodeURIComponent(setup.secret)}`, {
        method: 'POST', headers: authHeaders(),
      })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      setMsg(j.message || t('adm.2fa.activated'))
      setSetup(null); setOtp('')
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }

  async function disable2fa() {
    if (!confirm(t('adm.2fa.confirm_disable'))) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`${API}/api/v1/admin/2fa/disable`, { method: 'DELETE', headers: authHeaders() })
      if (!r.ok) throw new Error(await r.text())
      setMsg(t('adm.2fa.disabled'))
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── 2FA ─────────────────────────────────────────────────────────── */}
      <Card title={t('adm.2fa.title')} accent="#22C55E">
        <p className="text-xs text-slate-400">
          {t('adm.2fa.desc')}
        </p>

        {!setup && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={startSetup}
              disabled={busy}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600/80 text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy ? t('adm.2fa.generating') : t('adm.2fa.setup')}
            </button>
            <button
              onClick={disable2fa}
              disabled={busy}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-rose-500/10 text-rose-300 border border-rose-400/30 hover:bg-rose-500/20"
            >
              {t('adm.2fa.disable')}
            </button>
          </div>
        )}

        {setup && (
          <div className="mt-4 space-y-3">
            {setup.qr_code && (
              <div className="flex justify-center">
                <img src={setup.qr_code} alt={t('adm.2fa.qr_alt')} className="h-44 w-44 rounded-lg border border-slate-600 bg-white p-2" />
              </div>
            )}
            <div className="text-[11px] text-slate-400">
              {t('adm.2fa.secret')}
              <div className="mt-1 font-mono text-sm text-amber-300 bg-slate-800/80 rounded-md px-2 py-1.5 break-all border border-slate-700">
                {setup.secret}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">{t('adm.2fa.enter_code')}</label>
              <div className="flex gap-2">
                <input
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  className="flex-1 bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-sm tracking-[0.4em] font-mono text-slate-100 focus:ring-2 focus:ring-emerald-400 outline-none"
                  placeholder="123 456"
                />
                <button
                  onClick={verifyOtp}
                  disabled={busy || otp.length !== 6}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600/80 text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {t('adm.2fa.verify')}
                </button>
              </div>
            </div>
          </div>
        )}

        {msg && <div className="mt-3 text-xs text-emerald-300">{msg}</div>}
        {err && <div className="mt-3 text-xs text-rose-300">⚠ {err}</div>}
      </Card>

      {/* ── Other security tools ───────────────────────────────────────── */}
      <Card title={t('adm.c.other_sec')} accent="#A855F7">
        <ul className="space-y-2 text-sm">
          <SecurityLink href="/security/voice-training/" icon="🎙️" title={t('adm.sl.voice')}
            desc={t('adm.sl.voice.d')} />
          <SecurityLink href="/forgot-password" icon="🔑" title={t('adm.sl.reset')}
            desc={t('adm.sl.reset.d')} />
          <SecurityLink href="/modules/audit" icon="📋" title={t('adm.sl.audit')}
            desc={t('adm.sl.audit.d')} />
          <SecurityLink href="/install" icon="⚙️" title={t('adm.sl.install')}
            desc={t('adm.sl.install.d')} />
        </ul>
        <div className="mt-4 rounded-lg bg-slate-800/40 border border-slate-700 px-3 py-2 text-[11px] text-slate-400">
          {t('adm.signed_in_as')} <span className="font-mono text-slate-200">{user?.username}</span>
          {user?.is_superuser && <span className="ml-2 text-amber-300">{t('adm.superuser_paren')}</span>}
        </div>
      </Card>
    </div>
  )
}

function SecurityLink({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-start gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 hover:border-purple-400/50 hover:bg-slate-900/70 transition-colors"
      >
        <span className="text-xl leading-none mt-0.5">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-slate-100 font-semibold text-sm">{title}</span>
          <span className="block text-xs text-slate-400">{desc}</span>
        </span>
        <span className="text-slate-500">→</span>
      </Link>
    </li>
  )
}

// ── System tab ─────────────────────────────────────────────────────────────

function SystemTab() {
  const t = useT()
  const [stats, setStats] = useState<SystemStats | null>(null)

  useEffect(() => {
    fetch(`${API}/api/v1/admin/stats`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
  }, [])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title={t('adm.c.build')} accent={NEXUS_BLUE}>
        <Row k={t('adm.r.application')} v="JORINOVA NEXUS · ALIS-X" />
        <Row k={t('adm.r.version')}     v={<span className="font-mono">{stats?.system.version ?? '—'}</span>} />
        <Row k={t('adm.r.database')}    v={<span className="font-mono">{t('adm.tables', { n: stats?.system.db_tables ?? '—' })}</span>} />
        <Row k={t('adm.r.status')}      v={<span className="text-emerald-300 font-semibold uppercase">{stats?.system.status ?? t('adm.operational')}</span>} />
        <Row k={t('adm.r.server_date')} v={<span className="font-mono">{stats?.system.date ?? '—'}</span>} />
      </Card>

      <Card title={t('adm.c.workload')} accent="#0F766E">
        <Row k={t('adm.r.lab_requests')} v={stats?.lab.today_requests ?? 0} />
        <Row k={t('adm.r.validated')}    v={stats?.lab.validated_today ?? 0} />
        <Row k={t('adm.r.pending')}      v={stats?.lab.pending ?? 0} />
        <Row k={t('adm.r.critical')}     v={stats?.lab.critical_today ?? 0} />
        <Row k={t('adm.r.rejections')}   v={stats?.lab.rejections_today ?? 0} />
        <Row k={t('adm.r.audit')}        v={stats?.audit.entries_today ?? 0} />
      </Card>

      <Card title={t('adm.c.people')} accent="#A855F7">
        <Row k={t('adm.kpi.users')}        v={stats?.users.total_active ?? 0} />
        <Row k={t('adm.kpi.patients')}     v={stats?.patients.total_active ?? 0} />
        <Row k={t('adm.r.registered_today')} v={stats?.patients.registered_today ?? 0} />
      </Card>

      <Card title={t('adm.c.maintenance')} accent="#D4A017">
        <p className="text-xs text-slate-400">
          {t('adm.maint.body')}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-slate-800/50 border border-slate-700 px-3 py-2">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider">{t('adm.healthchecks')}</div>
            <div className="text-emerald-300 font-semibold">/login · /api/health</div>
          </div>
          <div className="rounded-lg bg-slate-800/50 border border-slate-700 px-3 py-2">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider">{t('adm.runbook')}</div>
            <div className="text-slate-200 font-mono">DEPLOYMENT.md</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ── Bits ───────────────────────────────────────────────────────────────────

function Kpi({ label, value, accent, hint }: { label: string; value: string | number; accent: string; hint?: string }) {
  return (
    <div
      className="rounded-xl bg-slate-900/60 backdrop-blur p-4 border"
      style={{
        borderColor: `${accent}55`,
        boxShadow:   `0 0 22px ${accent}1F, inset 0 0 0 1px ${accent}10`,
      }}
    >
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>{label}</div>
      <div className="text-3xl font-extrabold text-slate-100 mt-1" style={{ textShadow: `0 0 18px ${accent}55` }}>{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  )
}

function Card({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border bg-slate-900/60 backdrop-blur p-4 shadow-sm"
      style={{ borderColor: `${accent}40`, boxShadow: `0 0 14px ${accent}10` }}
    >
      <h3 className="text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: accent }}>{title}</h3>
      <div className="text-sm text-slate-200 space-y-1.5">{children}</div>
    </section>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-800/60 pb-1.5 last:border-0">
      <span className="text-xs text-slate-400">{k}</span>
      <span className="text-sm">{v}</span>
    </div>
  )
}

function QuickAction({ href, icon, label, desc }: { href: string; icon: string; label: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group rounded-xl bg-slate-900/60 backdrop-blur border border-slate-700/60 p-3 transition-all hover:border-purple-400/60 hover:bg-slate-900/80"
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="font-semibold text-sm text-slate-100 group-hover:text-purple-200">{label}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{desc}</div>
    </Link>
  )
}
