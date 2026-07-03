'use client'

/**
 * MedGenome — genomic database entered by AI or manually.
 * GET/POST /api/v1/ops/genomics.
 */
import { useCallback, useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
function tok(){ if(typeof window==='undefined') return null
  return document.cookie.split('; ').find(r=>r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token') }
function H(json=false):HeadersInit{ const t=tok(); return { ...(json?{'Content-Type':'application/json'}:{}), ...(t?{Authorization:`Bearer ${t}`}:{}) } }

interface Gene { id:number; pid:string|null; gene:string; variant:string|null; zygosity:string|null; classification:string|null; method:string; interpretation:string|null; created_at:string|null }
const CLS:Record<string,string>={ pathogenic:'bg-rose-500/20 text-rose-200', likely_pathogenic:'bg-rose-500/20 text-rose-200', vus:'bg-amber-500/20 text-amber-200', benign:'bg-emerald-500/20 text-emerald-200' }

export default function MedGenomePage(){
  return <RequireAuth><AppShell pageTag="MedGenome" theme="dark"><Inner/></AppShell></RequireAuth>
}
function Inner(){
  const [rows,setRows]=useState<Gene[]>([])
  const [f,setF]=useState({pid:'',gene:'',variant:'',zygosity:'het',classification:'VUS',method:'manual',interpretation:''})
  const [msg,setMsg]=useState<string|null>(null)
  const load=useCallback(async()=>{ try{ const r=await fetch(`${API}/api/v1/ops/genomics`,{headers:H()}); if(r.ok) setRows(await r.json()) }catch{} },[])
  useEffect(()=>{ void load() },[load])
  async function add(){
    if(!f.gene){ setMsg('Gene is required'); return }
    try{ const r=await fetch(`${API}/api/v1/ops/genomics`,{method:'POST',headers:H(true),body:JSON.stringify({...f, classification:f.classification.toLowerCase()})})
      if(r.ok){ setMsg('✅ saved'); setF({...f,gene:'',variant:'',interpretation:''}); await load() } else setMsg('⚠ failed') }catch{ setMsg('⚠ backend not reachable') }
  }
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-fuchsia-200">🧬 MedGenome</h1>
        <p className="text-xs text-slate-400 mt-1">Genomic findings — by AI or manual entry.</p>
      </div>

      <div className="rounded-xl border border-fuchsia-400/30 bg-slate-900/60 p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input placeholder="PID" value={f.pid} onChange={e=>setF({...f,pid:e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100"/>
        <input placeholder="Gene *" value={f.gene} onChange={e=>setF({...f,gene:e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100"/>
        <input placeholder="Variant (c./p.)" value={f.variant} onChange={e=>setF({...f,variant:e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100"/>
        <select value={f.classification} onChange={e=>setF({...f,classification:e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100">
          {['Pathogenic','Likely_pathogenic','VUS','Benign'].map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <select value={f.zygosity} onChange={e=>setF({...f,zygosity:e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100">
          <option value="het">Heterozygous</option><option value="hom">Homozygous</option>
        </select>
        <select value={f.method} onChange={e=>setF({...f,method:e.target.value})} className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100">
          <option value="manual">Manual</option><option value="ai">By AI</option>
        </select>
        <input placeholder="Interpretation" value={f.interpretation} onChange={e=>setF({...f,interpretation:e.target.value})} className="col-span-1 sm:col-span-1 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100"/>
        <button onClick={add} className="px-3 py-1.5 rounded bg-fuchsia-600 text-white text-sm font-semibold hover:bg-fuchsia-500">Add entry</button>
      </div>
      {msg && <div className="text-xs text-slate-300">{msg}</div>}

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
            <th className="px-3 py-2">Gene</th><th className="px-3 py-2">Variant</th><th className="px-3 py-2">Zygosity</th><th className="px-3 py-2">Classification</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">PID</th>
          </tr></thead>
          <tbody>
            {rows.map(g=>(
              <tr key={g.id} className="border-b border-slate-800/60">
                <td className="px-3 py-2 text-slate-100 font-semibold">{g.gene}</td>
                <td className="px-3 py-2 text-slate-300 font-mono text-xs">{g.variant??'—'}</td>
                <td className="px-3 py-2 text-slate-300">{g.zygosity??'—'}</td>
                <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full ${CLS[(g.classification??'').toLowerCase()]??'bg-slate-700 text-slate-300'}`}>{g.classification??'—'}</span></td>
                <td className="px-3 py-2 text-slate-300">{g.method==='ai'?'🤖 AI':'✍ manual'}</td>
                <td className="px-3 py-2 text-slate-400 font-mono text-xs">{g.pid??'—'}</td>
              </tr>
            ))}
            {rows.length===0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500 text-xs">No genomic entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
