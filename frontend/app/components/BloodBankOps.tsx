'use client'

/**
 * BloodBankOps — Quarantine release · Apheresis collection · Component production.
 * Wraps the /blood-bank/quarantine, /apheresis and /production endpoints.
 */

import { useCallback, useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const
const PROCS  = ['PLATELETPHERESIS', 'PLASMAPHERESIS', 'RBC_APHERESIS', 'MULTICOMPONENT', 'GRANULOCYTE'] as const
const APH_COMP = ['PLT', 'FFP', 'PRBC', 'GRAN'] as const
const PROD_COMP = ['PRBC', 'FFP', 'PLT', 'CRYO'] as const

function authHeader(extra?: HeadersInit): HeadersInit {
  const tok = typeof window !== 'undefined'
    ? (document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token'))
    : null
  return { ...(extra || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }
}
const today = () => new Date().toISOString().slice(0, 10)

type Bag = { bag_number: string; component: string; blood_group: string; volume_ml: number; collection_date: string; expiry_date: string; status: string }

export default function BloodBankOps() {
  const [quar, setQuar] = useState<Bag[]>([])
  const [aph, setAph]   = useState<any[]>([])
  const [prod, setProd] = useState<any[]>([])
  const [err, setErr]   = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const h = { headers: authHeader() }
      const [q, a, p] = await Promise.all([
        fetch(`${API}/api/v1/blood-bank/quarantine`, h),
        fetch(`${API}/api/v1/blood-bank/apheresis`, h),
        fetch(`${API}/api/v1/blood-bank/production`, h),
      ])
      if (q.ok) setQuar(await q.json())
      if (a.ok) setAph(await a.json())
      if (p.ok) setProd(await p.json())
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { void load() }, [load])

  async function release(bag: string, passed: boolean) {
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API}/api/v1/blood-bank/bags/${bag}/release?screening_passed=${passed}`, { method: 'POST', headers: authHeader() })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      await load()
    } catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  // Apheresis form
  const [af, setAf] = useState({ machine: '', procedure_type: 'PLATELETPHERESIS', component: 'PLT', blood_group: 'O+', volume_ml: 200, donor_id: '', collection_date: today() })
  async function submitAph() {
    setBusy(true); setErr('')
    try {
      const body: any = { ...af, volume_ml: Number(af.volume_ml), donor_id: af.donor_id ? Number(af.donor_id) : null }
      const r = await fetch(`${API}/api/v1/blood-bank/apheresis`, { method: 'POST', headers: authHeader({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      await load()
    } catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  // Production form
  const [pf, setPf] = useState<{ source_bag_number: string; components: string[]; method: string }>({ source_bag_number: '', components: ['PRBC', 'FFP'], method: 'centrifugation' })
  function toggleComp(c: string) { setPf(p => ({ ...p, components: p.components.includes(c) ? p.components.filter(x => x !== c) : [...p.components, c] })) }
  async function submitProd() {
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API}/api/v1/blood-bank/production`, { method: 'POST', headers: authHeader({ 'Content-Type': 'application/json' }), body: JSON.stringify(pf) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      setPf(p => ({ ...p, source_bag_number: '' })); await load()
    } catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  const inp = 'bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-100'

  return (
    <div className="space-y-5">
      {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">{err}</div>}

      {/* Quarantine */}
      <section className="rounded-xl border border-amber-700/40 bg-slate-900/60 p-4">
        <h3 className="text-sm font-bold text-amber-200 mb-3">⏳ Quarantine — awaiting screening release ({quar.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-400 text-[11px] uppercase"><tr>
              <th className="text-left px-2 py-1">Bag</th><th className="text-left px-2 py-1">Comp</th><th className="text-left px-2 py-1">Group</th><th className="text-left px-2 py-1">Expiry</th><th className="text-right px-2 py-1">Action</th>
            </tr></thead>
            <tbody>
              {quar.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-500">No units in quarantine.</td></tr>}
              {quar.map(b => (
                <tr key={b.bag_number} className="border-t border-slate-800">
                  <td className="px-2 py-1.5 font-mono text-slate-200">{b.bag_number}</td>
                  <td className="px-2 py-1.5">{b.component}</td>
                  <td className="px-2 py-1.5">{b.blood_group}</td>
                  <td className="px-2 py-1.5 text-slate-400">{b.expiry_date}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button onClick={() => release(b.bag_number, true)} disabled={busy} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-semibold mr-1 disabled:opacity-50">Release</button>
                    <button onClick={() => release(b.bag_number, false)} disabled={busy} className="px-2 py-1 rounded bg-rose-700/80 text-white text-xs disabled:opacity-50">Discard</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Apheresis */}
      <section className="rounded-xl border border-sky-700/40 bg-slate-900/60 p-4">
        <h3 className="text-sm font-bold text-sky-200 mb-3">🩸 Apheresis collection (machine)</h3>
        <div className="grid sm:grid-cols-3 gap-2">
          <input className={inp} placeholder="Machine (Trima/Amicus…)" value={af.machine} onChange={e => setAf({ ...af, machine: e.target.value })} />
          <select className={inp} value={af.procedure_type} onChange={e => setAf({ ...af, procedure_type: e.target.value })}>{PROCS.map(p => <option key={p} value={p}>{p}</option>)}</select>
          <select className={inp} value={af.component} onChange={e => setAf({ ...af, component: e.target.value })}>{APH_COMP.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <select className={inp} value={af.blood_group} onChange={e => setAf({ ...af, blood_group: e.target.value })}>{GROUPS.map(g => <option key={g} value={g}>{g}</option>)}</select>
          <input className={inp} type="number" placeholder="Volume ml" value={af.volume_ml} onChange={e => setAf({ ...af, volume_ml: Number(e.target.value) })} />
          <input className={inp} type="date" value={af.collection_date} onChange={e => setAf({ ...af, collection_date: e.target.value })} />
          <input className={inp} placeholder="Donor ID (optional)" value={af.donor_id} onChange={e => setAf({ ...af, donor_id: e.target.value })} />
          <button onClick={submitAph} disabled={busy} className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm font-semibold disabled:opacity-50">+ Collect</button>
        </div>
        {aph.length > 0 && (
          <div className="mt-3 text-xs text-slate-400 space-y-1">
            {aph.slice(0, 6).map(a => <div key={a.id}>• {a.collection_no} · {a.procedure_type} · {a.component} · {a.blood_group} {a.machine ? `· ${a.machine}` : ''}</div>)}
          </div>
        )}
      </section>

      {/* Component production */}
      <section className="rounded-xl border border-purple-700/40 bg-slate-900/60 p-4">
        <h3 className="text-sm font-bold text-purple-200 mb-3">🧪 Component production (split a Whole-Blood unit)</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input className={inp} placeholder="Source WB bag number" value={pf.source_bag_number} onChange={e => setPf({ ...pf, source_bag_number: e.target.value })} />
          <div className="flex items-center gap-2">
            {PROD_COMP.map(c => (
              <label key={c} className="flex items-center gap-1 text-xs text-slate-300">
                <input type="checkbox" checked={pf.components.includes(c)} onChange={() => toggleComp(c)} /> {c}
              </label>
            ))}
          </div>
          <button onClick={submitProd} disabled={busy || !pf.source_bag_number || pf.components.length === 0} className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-semibold disabled:opacity-50">+ Produce</button>
        </div>
        {prod.length > 0 && (
          <div className="mt-3 text-xs text-slate-400 space-y-1">
            {prod.slice(0, 6).map(p => <div key={p.id}>• {p.source_bag_number} → {(p.produced || []).map((x: any) => `${x.component}(${x.bag_number})`).join(', ')}</div>)}
          </div>
        )}
      </section>
    </div>
  )
}
