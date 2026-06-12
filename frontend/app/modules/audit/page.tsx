'use client'

/**
 * Audit module — system-wide activity log.
 *
 * Consumes:
 *   GET /api/v1/audit/logs?entity_type=&action=&date_from=&date_to=
 *   GET /api/v1/audit/logs/stats
 *
 * Visible only to super_admin / it_admin / security_officer / lab_manager
 * (backend enforces). Frontend shows a "no rights" message if list is empty
 * and stats endpoint returns {}.
 */

import { useCallback, useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface AuditLog {
  id: number; timestamp: string; entity_type: string; entity_id?: string
  action: string; performed_by_id?: number; performed_by?: string
  user_role?: string; source?: string; department?: string
  patient_pid?: string; patient_lid?: string; sample_sid?: string
  metadata_json?: string; pqc_hash?: string
}
interface Stats {
  total_logs?: number; today?: number
  by_entity?: Record<string, number>
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit {
  const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function AuditPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Audit" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [logs,       setLogs]       = useState<AuditLog[]>([])
  const [stats,      setStats]      = useState<Stats>({})
  const [entityType, setEntityType] = useState('')
  const [action,     setAction]     = useState('')
  const [patientPid, setPatientPid] = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [err,        setErr]        = useState<string | null>(null)
  const [loading,    setLoading]    = useState(false)

  const load = useCallback(() => {
    setLoading(true); setErr(null)
    const p = new URLSearchParams()
    if (entityType) p.set('entity_type', entityType)
    if (action)     p.set('action',      action)
    if (patientPid) p.set('patient_pid', patientPid)
    if (dateFrom)   p.set('date_from',   dateFrom)
    if (dateTo)     p.set('date_to',     dateTo)
    p.set('limit', '200')
    fetch(`${API}/api/v1/audit/logs?${p.toString()}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setLogs)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [entityType, action, patientPid, dateFrom, dateTo])

  useEffect(() => {
    load()
    fetch(`${API}/api/v1/audit/logs/stats`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : {}).then(setStats).catch(() => {})
  }, [load])

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(168,85,247,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(168,85,247,0.06) 100%)' }}>
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-purple-200" style={{ textShadow: '0 0 20px rgba(168,85,247,0.30)' }}>
            📋 {t('mod.audit')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.audit.sub')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-5 space-y-4">
        {/* Stats */}
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <Kpi label={t('audit.kpi.total')}   value={stats.total_logs ?? '—'} accent="#A855F7" />
            <Kpi label={t('audit.kpi.today')}   value={stats.today ?? '—'}      accent="#0066CC" />
            <Kpi label={t('audit.kpi.patient')} value={stats.by_entity?.PATIENT ?? '—'}   accent="#22C55E" />
            <Kpi label={t('audit.kpi.lab')}     value={stats.by_entity?.LAB ?? '—'}       accent="#F59E0B" />
            <Kpi label={t('audit.kpi.result')}  value={stats.by_entity?.RESULT ?? '—'}    accent="#06B6D4" />
            <Kpi label={t('audit.kpi.security')} value={stats.by_entity?.SECURITY ?? '—'}  accent="#DC2626" />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900/60 border border-slate-700/60 p-3">
          <select value={entityType} onChange={e => setEntityType(e.target.value)}
            className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100">
            <option value="">{t('audit.all_entities')}</option>
            {['PATIENT','LAB','RESULT','SAMPLE','USER','SECURITY','BILLING','INVENTORY','BLOOD_BANK'].map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <input value={action} onChange={e => setAction(e.target.value)} placeholder={t('audit.action_ph')}
            className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 w-40" />
          <input value={patientPid} onChange={e => setPatientPid(e.target.value)} placeholder={t('audit.pid_ph')}
            className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 w-40" />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100" />
          <button onClick={load}
            className="ml-auto px-3 py-2 text-xs rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-500">
            {t('common.refresh')}
          </button>
          <span className="text-xs text-slate-400 font-mono">{t('audit.entries', { n: logs.length })}</span>
        </div>

        {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">{err}</div>}

        {logs.length === 0 && !loading && !err && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-10 text-center text-slate-400 text-sm">
            {t('audit.empty')}
            {Object.keys(stats).length === 0 && <div className="mt-2 text-xs text-slate-500">{t('audit.no_rights')}</div>}
          </div>
        )}

        {logs.length > 0 && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="text-left px-3 py-2">{t('audit.h.when')}</th>
                    <th className="text-left px-3 py-2">{t('audit.h.entity')}</th>
                    <th className="text-left px-3 py-2">{t('audit.h.action')}</th>
                    <th className="text-left px-3 py-2">{t('audit.h.by')}</th>
                    <th className="text-left px-3 py-2">{t('audit.kpi.patient')}</th>
                    <th className="text-left px-3 py-2">{t('audit.h.sample')}</th>
                    <th className="text-left px-3 py-2">{t('audit.h.source')}</th>
                    <th className="text-left px-3 py-2">{t('audit.h.dept')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-slate-400 font-mono">{l.timestamp ? new Date(l.timestamp).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-400/30">
                          {l.entity_type}{l.entity_id ? ` #${l.entity_id}` : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-200 font-mono uppercase">{l.action}</td>
                      <td className="px-3 py-2 text-slate-300">{l.performed_by || `${t('audit.user_no')}${l.performed_by_id}`} <span className="text-slate-500 text-[10px]">{l.user_role}</span></td>
                      <td className="px-3 py-2 text-slate-400 font-mono">{l.patient_pid || '—'}</td>
                      <td className="px-3 py-2 text-slate-400 font-mono">{l.sample_sid || '—'}</td>
                      <td className="px-3 py-2 text-slate-400 text-[11px]">{l.source || '—'}</td>
                      <td className="px-3 py-2 text-slate-400 text-[11px]">{l.department || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Kpi({ label, value, accent }: { label: string; value: any; accent: string }) {
  return (
    <div className="rounded-xl bg-slate-900/60 backdrop-blur p-3 border"
         style={{ borderColor: `${accent}55`, boxShadow: `0 0 16px ${accent}1F` }}>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>{label}</div>
      <div className="text-2xl font-extrabold text-slate-100 mt-0.5" style={{ textShadow: `0 0 14px ${accent}55` }}>{value}</div>
    </div>
  )
}
