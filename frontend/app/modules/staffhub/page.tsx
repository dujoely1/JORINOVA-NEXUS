'use client'

/** StaffHub module — staff roster + timetable + leave + performance. */
import { useCallback, useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL || ''
function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {} }

interface Staff { id: number; full_name?: string; employee_id?: string; department?: string; role?: string; is_active?: boolean; phone?: string; email?: string }
interface Shift { id: number; staff_id: number; staff_name?: string; shift_date?: string; shift_type?: string; department?: string; status?: string }
interface Leave { id: number; staff_id: number; staff_name?: string; leave_type?: string; start_date?: string; end_date?: string; status?: string; reason?: string }

type Tab = 'staff' | 'timetable' | 'leave'

export default function StaffhubPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="StaffHub" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('staff')
  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(6,182,212,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(6,182,212,0.06) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-cyan-200" style={{ textShadow: '0 0 20px rgba(6,182,212,0.30)' }}>
            🧑‍⚕️ {t('mod.staffhub')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.staffhub.sub')}</p>
          <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-700/60 -mb-px">
            {([
              ['staff',     t('sh.tab.staff'),     '👥'],
              ['timetable', t('sh.tab.timetable'), '📅'],
              ['leave',     t('sh.tab.leave'),     '🏖️'],
            ] as const).map(([k, l, i]) => {
              const on = tab === k
              return (
                <button key={k} onClick={() => setTab(k as Tab)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-2
                    ${on ? 'text-cyan-300 border-cyan-400 bg-slate-900/60' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
                  <span>{i}</span>{l}
                </button>
              )
            })}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
        {tab === 'staff'     && <StaffTab />}
        {tab === 'timetable' && <TimetableTab />}
        {tab === 'leave'     && <LeaveTab />}
      </div>
    </>
  )
}

function useList<T>(url: string) {
  const [rows, setRows] = useState<T[]>([])
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => {
    fetch(`${API}${url}`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(j => setRows(Array.isArray(j) ? j : (j.staff || j.shifts || j.leaves || j.timetable || [])))
      .catch(e => setErr(String(e.message || e)))
  }, [url])
  useEffect(load, [load])
  return { rows, err }
}

function StaffTab() {
  const t = useT()
  const { rows, err } = useList<Staff>('/api/v1/staffhub/staff?limit=300')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('sh.h.emp_id'),t('tbl.name'),t('sh.h.department'),t('sh.h.role'),t('sh.h.phone'),t('tbl.status')]}>
      {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">{t('sh.empty.staff')}</td></tr>}
      {rows.map(s => (
        <tr key={s.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-200">{s.employee_id || `#${s.id}`}</td>
          <td className="px-3 py-2 text-slate-100 font-semibold">{s.full_name || '—'}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{s.department || '—'}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{s.role || '—'}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{s.phone || '—'}</td>
          <td className="px-3 py-2">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
              s.is_active ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30' : 'text-slate-400 bg-slate-700/50 border-slate-500/30'
            }`}>{s.is_active ? t('sh.active') : t('sh.inactive')}</span>
          </td>
        </tr>
      ))}
    </Table>
  )
}

function TimetableTab() {
  const t = useT()
  const { rows, err } = useList<Shift>('/api/v1/staffhub/timetable?days=14')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('tbl.date'),t('sh.h.shift'),t('sh.h.staff'),t('sh.h.department'),t('tbl.status')]}>
      {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">{t('sh.empty.timetable')}</td></tr>}
      {rows.map(s => (
        <tr key={s.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 font-mono text-slate-400 text-xs">{s.shift_date || '—'}</td>
          <td className="px-3 py-2 text-slate-200 font-semibold">{s.shift_type || '—'}</td>
          <td className="px-3 py-2 text-slate-200">{s.staff_name || `${t('sh.staff_no')}${s.staff_id}`}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{s.department || '—'}</td>
          <td className="px-3 py-2 text-slate-400 text-xs">{s.status || '—'}</td>
        </tr>
      ))}
    </Table>
  )
}

function LeaveTab() {
  const t = useT()
  const { rows, err } = useList<Leave>('/api/v1/staffhub/leave?limit=200')
  if (err) return <Err msg={err} />
  return (
    <Table headers={[t('sh.h.staff'),t('sh.h.type'),t('common.from'),t('common.to'),t('sh.h.reason'),t('tbl.status')]}>
      {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">{t('sh.empty.leave')}</td></tr>}
      {rows.map(l => (
        <tr key={l.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
          <td className="px-3 py-2 text-slate-200">{l.staff_name || `${t('sh.staff_no')}${l.staff_id}`}</td>
          <td className="px-3 py-2 text-slate-300 text-xs">{l.leave_type || '—'}</td>
          <td className="px-3 py-2 font-mono text-slate-400 text-xs">{l.start_date || '—'}</td>
          <td className="px-3 py-2 font-mono text-slate-400 text-xs">{l.end_date || '—'}</td>
          <td className="px-3 py-2 text-slate-400 text-xs max-w-md truncate">{l.reason || '—'}</td>
          <td className="px-3 py-2">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
              l.status === 'approved' ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30' :
              l.status === 'rejected' ? 'text-rose-300 bg-rose-500/15 border-rose-400/30' :
              'text-amber-300 bg-amber-500/15 border-amber-400/30'
            }`}>{l.status === 'approved' ? t('sh.st.approved') : l.status === 'rejected' ? t('sh.st.rejected') : t('sh.st.pending')}</span>
          </td>
        </tr>
      ))}
    </Table>
  )
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
