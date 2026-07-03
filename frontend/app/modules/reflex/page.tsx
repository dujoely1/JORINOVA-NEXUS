'use client'

/**
 * AI Reflex Tests — the Lab AI proposes additional tests; a doctor approves,
 * which creates a LabRequest and generates an SMS to the patient.
 * GET /api/v1/ops/reflex · POST /ops/reflex/suggest · POST /ops/reflex/{id}/approve.
 */
import { useCallback, useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
function tok(){ if(typeof window==='undefined') return null
  return document.cookie.split('; ').find(r=>r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token') }
function H(json=false):HeadersInit{ const t=tok(); return { ...(json?{'Content-Type':'application/json'}:{}), ...(t?{Authorization:`Bearer ${t}`}:{}) } }

interface Reflex { id:number; pid:string|null; trigger:string|null; suggested_test:string; reason:string|null; ai_confidence:string|null; status:string }

export default function ReflexPage(){
  return <RequireAuth><AppShell pageTag="AI Reflex Tests" theme="dark"><Inner/></AppShell></RequireAuth>
}
function Inner(){
  const [rows,setRows]=useState<Reflex[]>([])
  const [msg,setMsg]=useState<string|null>(null)
  const [busy,setBusy]=useState<number|null>(null)
  const [pid,setPid]=useState('')
  const load=useCallback(async()=>{ try{ const r=await fetch(`${API}/api/v1/ops/reflex?status=pending`,{headers:H()}); if(r.ok) setRows(await r.json()) }catch{} },[])
  useEffect(()=>{ void load() },[load])

  async function approve(id:number){
    setBusy(id); setMsg(null)
    try{ const r=await fetch(`${API}/api/v1/ops/reflex/${id}/approve`,{method:'POST',headers:H(true)})
      const d=await r.json().catch(()=>({})); setMsg(r.ok?`✅ Approved${d.lab_id?` → ${d.lab_id}`:''} · SMS: ${d.sms}`:`⚠ ${d.detail??'failed'}`); await load()
    }catch{ setMsg('⚠ backend not reachable') } finally{ setBusy(null) }
  }
  async function suggest(){
    const opts=[['High WBC + fever','CRP','rule out bacterial infection'],['Low Hb','Reticulocyte count','characterise anaemia'],['Positive malaria','G6PD','before primaquine'],['High glucose','HbA1c','confirm diabetes']]
    const o=opts[Math.floor(Math.random()*opts.length)]
    try{ await fetch(`${API}/api/v1/ops/reflex/suggest`,{method:'POST',headers:H(true),body:JSON.stringify({pid:pid||null,trigger:o[0],suggested_test:o[1],reason:o[2],ai_confidence:'high'})}); await load() }catch{}
  }
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-emerald-200">🤖 AI Reflex Tests</h1>
          <p className="text-xs text-slate-400 mt-1">Lab AI proposes an extra test → doctor approves → LabRequest + SMS.</p>
        </div>
        <div className="flex items-center gap-2">
          <input placeholder="PID (optional)" value={pid} onChange={e=>setPid(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 w-32"/>
          <button onClick={suggest} className="text-xs px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800">Simulate AI suggestion</button>
        </div>
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100">{msg}</div>}

      <div className="space-y-2">
        {rows.map(r=>(
          <div key={r.id} className="rounded-xl border border-emerald-400/30 bg-slate-900/60 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm text-slate-100 font-semibold">Suggest: {r.suggested_test}
                {r.ai_confidence && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/40">AI {r.ai_confidence}</span>}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Trigger: {r.trigger??'—'} · {r.reason??''}{r.pid?` · PID ${r.pid}`:''}</div>
            </div>
            <button onClick={()=>approve(r.id)} disabled={busy===r.id} className="text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50">{busy===r.id?'…':'Doctor approve → order + SMS'}</button>
          </div>
        ))}
        {rows.length===0 && <div className="text-slate-500 text-xs text-center py-6">No pending AI suggestions.</div>}
      </div>
    </div>
  )
}
