'use client'

/**
 * Reception & Phlebotomy — patient/sample intake (register visits) and
 * phlebotomy (mark samples collected/received). Backed by /api/v1/reception/*.
 * Separate from Blood Bank (not every facility has a blood bank).
 */

import { useCallback, useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function authHeader(extra?: HeadersInit): HeadersInit {
  const tok = typeof window !== 'undefined'
    ? (document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token'))
    : null
  return { ...(extra || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }
}

type Visit = {
  id: number; visit_no: string; visit_type: string; status: string
  patient_name?: string; pid?: string; age?: string; sex?: string
  ward?: string; tests_ordered?: string; urgency?: string; created_at?: string
}
type Tab = 'reception' | 'phlebotomy'

export default function ReceptionPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Reception & Phlebotomy" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const [tab, setTab] = useState<Tab>('reception')
  const [visits, setVisits] = useState<Visit[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/reception/visits?limit=100`, { headers: authHeader() })
      if (r.status === 401) { window.location.href = '/login?reason=expired'; return }
      if (r.ok) setVisits(await r.json())
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { void load() }, [load])

  const empty = { visit_type: 'OPD', patient_name: '', pid: '', age: '', sex: 'M', phone: '', referring_doctor: '', ward: '', bed_number: '', clinical_indication: '', tests_ordered: '', urgency: 'routine' }
  const [f, setF] = useState(empty)

  async function register() {
    if (!f.patient_name && !f.pid) { setErr('Enter patient name or PID'); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API}/api/v1/reception/visits`, { method: 'POST', headers: authHeader({ 'Content-Type': 'application/json' }), body: JSON.stringify(f) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      setF(empty); await load()
    } catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  async function collect(id: number) {
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API}/api/v1/reception/visits/${id}/received`, { method: 'POST', headers: authHeader() })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      await load()
    } catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  const inp = 'bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500'
  const pending = visits.filter(v => v.status === 'REGISTERED')

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(16,185,129,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(16,185,129,0.08) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-emerald-200" style={{ textShadow: '0 0 20px rgba(16,185,129,0.30)' }}>🩺 Reception &amp; Phlebotomy</h1>
          <p className="text-sm text-slate-400 mt-1">Patient intake, visit registration and sample collection.</p>
          <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-700/60 -mb-px">
            {([['reception', 'Reception', '📝'], ['phlebotomy', `Phlebotomy (${pending.length})`, '💉']] as const).map(([k, l, i]) => (
              <button key={k} onClick={() => setTab(k as Tab)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 flex items-center gap-2 ${tab === k ? 'text-emerald-300 border-emerald-400 bg-slate-900/60' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
                <span>{i}</span>{l}
              </button>
            ))}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 space-y-5">
        {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">{err}</div>}

        {tab === 'reception' && (
          <>
            <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
              <h3 className="text-sm font-bold text-emerald-300 mb-3">Register visit</h3>
              <div className="grid sm:grid-cols-3 gap-2">
                <select className={inp} value={f.visit_type} onChange={e => setF({ ...f, visit_type: e.target.value })}><option>OPD</option><option>IPD</option><option>ED</option></select>
                <input className={inp} placeholder="Patient name" value={f.patient_name} onChange={e => setF({ ...f, patient_name: e.target.value })} />
                <input className={inp} placeholder="PID (optional)" value={f.pid} onChange={e => setF({ ...f, pid: e.target.value })} />
                <input className={inp} placeholder="Age" value={f.age} onChange={e => setF({ ...f, age: e.target.value })} />
                <select className={inp} value={f.sex} onChange={e => setF({ ...f, sex: e.target.value })}><option value="M">Male</option><option value="F">Female</option></select>
                <input className={inp} placeholder="Phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
                <input className={inp} placeholder="Referring doctor" value={f.referring_doctor} onChange={e => setF({ ...f, referring_doctor: e.target.value })} />
                <input className={inp} placeholder="Ward (IPD)" value={f.ward} onChange={e => setF({ ...f, ward: e.target.value })} />
                <input className={inp} placeholder="Bed (IPD)" value={f.bed_number} onChange={e => setF({ ...f, bed_number: e.target.value })} />
                <input className={inp + ' sm:col-span-2'} placeholder="Tests ordered" value={f.tests_ordered} onChange={e => setF({ ...f, tests_ordered: e.target.value })} />
                <select className={inp} value={f.urgency} onChange={e => setF({ ...f, urgency: e.target.value })}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="stat">STAT</option></select>
                <input className={inp + ' sm:col-span-3'} placeholder="Clinical indication" value={f.clinical_indication} onChange={e => setF({ ...f, clinical_indication: e.target.value })} />
              </div>
              <button onClick={register} disabled={busy} className="mt-3 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">+ Register visit</button>
            </section>

            <VisitTable title="Recent visits" rows={visits} />
          </>
        )}

        {tab === 'phlebotomy' && (
          <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
            <h3 className="text-sm font-bold text-emerald-300 mb-3">💉 Awaiting sample collection ({pending.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-400 text-[11px] uppercase"><tr>
                  <th className="text-left px-2 py-1">Visit</th><th className="text-left px-2 py-1">Patient</th><th className="text-left px-2 py-1">Type</th><th className="text-left px-2 py-1">Tests</th><th className="text-right px-2 py-1">Action</th>
                </tr></thead>
                <tbody>
                  {pending.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-500">No samples awaiting collection.</td></tr>}
                  {pending.map(v => (
                    <tr key={v.id} className="border-t border-slate-800">
                      <td className="px-2 py-1.5 font-mono text-slate-200">{v.visit_no}</td>
                      <td className="px-2 py-1.5">{v.patient_name || v.pid || '—'}</td>
                      <td className="px-2 py-1.5">{v.visit_type}</td>
                      <td className="px-2 py-1.5 text-slate-400 truncate max-w-[200px]">{v.tests_ordered || '—'}</td>
                      <td className="px-2 py-1.5 text-right"><button onClick={() => collect(v.id)} disabled={busy} className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">✓ Sample collected</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  )
}

function VisitTable({ title, rows }: { title: string; rows: Visit[] }) {
  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
      <h3 className="text-sm font-bold text-slate-300 mb-3">{title} ({rows.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-[11px] uppercase"><tr>
            <th className="text-left px-2 py-1">Visit</th><th className="text-left px-2 py-1">Patient</th><th className="text-left px-2 py-1">Type</th><th className="text-left px-2 py-1">Status</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-slate-500">No visits yet.</td></tr>}
            {rows.map(v => (
              <tr key={v.id} className="border-t border-slate-800">
                <td className="px-2 py-1.5 font-mono text-slate-200">{v.visit_no}</td>
                <td className="px-2 py-1.5">{v.patient_name || v.pid || '—'}</td>
                <td className="px-2 py-1.5">{v.visit_type}</td>
                <td className="px-2 py-1.5"><span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">{v.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
