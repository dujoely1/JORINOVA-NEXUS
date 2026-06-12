'use client'

/**
 * Notifications module — my inbox of in-app alerts.
 *
 * Consumes:
 *   GET  /api/v1/notifications/my?unread_only=&priority=
 *   GET  /api/v1/notifications/unread-count
 *   POST /api/v1/notifications/mark-read/{id}
 *   POST /api/v1/notifications/mark-all-read
 *   POST /api/v1/notifications/acknowledge/{id}
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface Notif {
  id: number; notif_type: string; title: string; body: string; priority: string
  entity_type?: string; entity_id?: number; patient_pid?: string; action_url?: string
  is_read: boolean; acknowledged: boolean; created_at?: string
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit {
  const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Notifications" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [rows,     setRows]     = useState<Notif[]>([])
  const [unread,   setUnread]   = useState<{ unread: number; critical_unread: number }>({ unread: 0, critical_unread: 0 })
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [priority, setPriority] = useState('')
  const [err,      setErr]      = useState<string | null>(null)

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (unreadOnly) p.set('unread_only', 'true')
    if (priority)   p.set('priority', priority)
    p.set('limit', '100')
    fetch(`${API}/api/v1/notifications/my?${p.toString()}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setRows).catch(e => setErr(String(e)))
    fetch(`${API}/api/v1/notifications/unread-count`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null).then(j => j && setUnread(j)).catch(() => {})
  }, [unreadOnly, priority])

  useEffect(load, [load])

  async function markRead(id: number) {
    await fetch(`${API}/api/v1/notifications/mark-read/${id}`, { method: 'POST', headers: authHeaders() })
    load()
  }
  async function ack(id: number) {
    await fetch(`${API}/api/v1/notifications/acknowledge/${id}`, { method: 'POST', headers: authHeaders() })
    load()
  }
  async function markAll() {
    if (!confirm(t('notif.mark_all_confirm'))) return
    await fetch(`${API}/api/v1/notifications/mark-all-read`, { method: 'POST', headers: authHeaders() })
    load()
  }

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(56,189,248,0.25)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(56,189,248,0.06) 100%)' }}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-sky-200" style={{ textShadow: '0 0 20px rgba(56,189,248,0.30)' }}>
                🔔 {t('mod.notifications')}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {unread.unread > 0 ? <span className="font-bold text-amber-300">{t('notif.unread', { n: unread.unread })}</span> : t('notif.all_caught')}
                {unread.critical_unread > 0 && <span className="ml-3 font-bold text-rose-300">{t('notif.critical_unread', { n: unread.critical_unread })}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
                {t('notif.unread_only')}
              </label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="bg-slate-800/80 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-100">
                <option value="">{t('notif.all_priorities')}</option>
                <option value="CRITICAL">{t('notif.pri.critical')}</option>
                <option value="HIGH">{t('notif.pri.high')}</option>
                <option value="NORMAL">{t('notif.pri.normal')}</option>
                <option value="LOW">{t('notif.pri.low')}</option>
              </select>
              {unread.unread > 0 && (
                <button onClick={markAll}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500">
                  {t('notif.mark_all')}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-5 space-y-2">
        {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">{err}</div>}
        {!err && rows.length === 0 && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-10 text-center text-slate-400 text-sm">
            {t('notif.empty')}
          </div>
        )}
        {rows.map(n => {
          const pri = n.priority.toUpperCase()
          const accent = pri === 'CRITICAL' ? '#DC2626' : pri === 'HIGH' ? '#F59E0B' : pri === 'LOW' ? '#64748B' : '#0066CC'
          return (
            <div key={n.id}
              className={`rounded-xl border p-3 ${n.is_read ? 'bg-slate-900/40' : 'bg-slate-900/70 ring-1'}`}
              style={{ borderColor: `${accent}55`, boxShadow: n.is_read ? undefined : `0 0 16px ${accent}25` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border"
                      style={{ color: accent, background: `${accent}1A`, borderColor: `${accent}55` }}>{pri}</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">{n.notif_type}</span>
                    {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />}
                  </div>
                  <h3 className="font-semibold text-slate-100 mt-1">{n.title}</h3>
                  <p className="text-sm text-slate-300 mt-0.5">{n.body}</p>
                  {n.patient_pid && (
                    <Link href={`/modules/patients`} className="text-[11px] text-sky-300 hover:underline mt-1 inline-block">
                      {t('notif.patient')} {n.patient_pid}
                    </Link>
                  )}
                  {n.action_url && (
                    <Link href={n.action_url} className="text-[11px] text-sky-300 hover:underline mt-1 ml-3 inline-block">
                      {t('notif.open')}
                    </Link>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-500">
                    {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                  </div>
                  <div className="mt-1 flex gap-1 justify-end">
                    {!n.is_read && (
                      <button onClick={() => markRead(n.id)}
                        className="px-2 py-0.5 text-[10px] rounded-md bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700">
                        {t('notif.mark_read')}
                      </button>
                    )}
                    {pri === 'CRITICAL' && !n.acknowledged && (
                      <button onClick={() => ack(n.id)}
                        className="px-2 py-0.5 text-[10px] rounded-md bg-rose-500/15 text-rose-300 border border-rose-400/30 hover:bg-rose-500/25 font-semibold">
                        {t('notif.acknowledge')}
                      </button>
                    )}
                    {n.acknowledged && (
                      <span className="text-[10px] text-emerald-400">{t('notif.acknowledged')}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
