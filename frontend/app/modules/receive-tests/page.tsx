'use client'

/**
 * Receive Tests — interoperability intake. Test orders pushed from the clinic
 * system land here; accepting one auto-creates the patient (if new) and a
 * LabRequest in the LIS. GET/POST /api/v1/ops/incoming-orders[/{id}/accept].
 */

import { useCallback, useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
function tok() { if (typeof window==='undefined') return null
  return document.cookie.split('; ').find(r=>r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token') }
function H(json=false): HeadersInit { const t=tok(); return { ...(json?{'Content-Type':'application/json'}:{}), ...(t?{Authorization:`Bearer ${t}`}:{}) } }

interface Order { id:number; source:string; patient_name:string; pid:string|null; district:string|null; ward:string|null; tests:string; priority:string; status:string; lab_request_id:number|null; received_at:string|null }

export default function ReceiveTestsPage() {
  return <RequireAuth><AppShell pageTag="Receive Tests" theme="dark"><Inner/></AppShell></RequireAuth>
}

function Inner() {
  const [orders,setOrders]=useState<Order[]>([])
  const [msg,setMsg]=useState<string|null>(null)
  const [busy,setBusy]=useState<number|null>(null)

  const load=useCallback(async()=>{
    try{ const r=await fetch(`${API}/api/v1/ops/incoming-orders?status=pending`,{headers:H()}); if(r.ok) setOrders(await r.json()) }catch{}
  },[])
  useEffect(()=>{ void load() },[load])

  async function accept(id:number){
    setBusy(id); setMsg(null)
    try{
      const r=await fetch(`${API}/api/v1/ops/incoming-orders/${id}/accept`,{method:'POST',headers:H(true)})
      const d=await r.json().catch(()=>({}))
      setMsg(r.ok?`✅ ${d.message} — ${d.lab_id} (${d.pid})`:`⚠ ${d.detail??'failed'}`)
      await load()
    }catch{ setMsg('⚠ backend not reachable') } finally{ setBusy(null) }
  }

  async function demo(){
    setMsg(null)
    const names=['Uwera Aline','Habimana Jean','Mukamana Grace','Niyonzima Eric']
    const tests=['CBC, Malaria','Widal, Stool','HIV, HBsAg','Glucose, Creatinine']
    const i=Math.floor(Math.random()*names.length)
    try{ await fetch(`${API}/api/v1/ops/incoming-orders`,{method:'POST',headers:H(true),
      body:JSON.stringify({patient_name:names[i],tests:tests[i],district:'Musanze',ward:'OPD',priority:'routine',source:'clinic'})}); await load() }catch{}
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-sky-200">📥 Receive Tests</h1>
          <p className="text-xs text-slate-400 mt-1">Orders from the clinic system auto-enter the LIS on accept.</p>
        </div>
        <button onClick={demo} className="text-xs px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800">Simulate a clinic order</button>
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100">{msg}</div>}

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
            <th className="px-3 py-2">Patient</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Ward · District</th><th className="px-3 py-2">Tests</th><th className="px-3 py-2">Priority</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {orders.map(o=>(
              <tr key={o.id} className="border-b border-slate-800/60">
                <td className="px-3 py-2 text-slate-100 font-medium">{o.patient_name}{o.pid?<span className="text-slate-400 font-mono text-xs"> · {o.pid}</span>:null}</td>
                <td className="px-3 py-2 text-slate-300">{o.source}</td>
                <td className="px-3 py-2 text-slate-300">{o.ward??'—'} · {o.district??'—'}</td>
                <td className="px-3 py-2 text-slate-200">{o.tests}</td>
                <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full ${o.priority==='stat'?'bg-rose-500/20 text-rose-200':o.priority==='urgent'?'bg-amber-500/20 text-amber-200':'bg-slate-700 text-slate-300'}`}>{o.priority}</span></td>
                <td className="px-3 py-2 text-right"><button onClick={()=>accept(o.id)} disabled={busy===o.id} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50">{busy===o.id?'…':'Accept → LIS'}</button></td>
              </tr>
            ))}
            {orders.length===0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500 text-xs">No pending clinic orders.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
