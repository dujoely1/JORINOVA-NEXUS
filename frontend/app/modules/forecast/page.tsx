'use client'

/**
 * Forecast — per-item stock-out projection from current stock & reorder level.
 * GET /api/v1/ops/forecast.
 */
import { useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
function tok(){ if(typeof window==='undefined') return null
  return document.cookie.split('; ').find(r=>r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token') }

interface Row { name:string; stock:number; reorder_level:number; est_daily_use:number; days_to_stockout:number|null; status:string }
const COL:Record<string,string>={ critical:'#ef4444', watch:'#f59e0b', ok:'#10b981' }

export default function ForecastPage(){
  return <RequireAuth><AppShell pageTag="Forecast" theme="dark"><Inner/></AppShell></RequireAuth>
}
function Inner(){
  const [rows,setRows]=useState<Row[]>([])
  const [loading,setLoading]=useState(true)
  useEffect(()=>{ (async()=>{
    try{ const t=tok(); const r=await fetch(`${API}/api/v1/ops/forecast`,{headers:t?{Authorization:`Bearer ${t}`}:{}}); if(r.ok) setRows(await r.json()) }catch{} finally{ setLoading(false) }
  })() },[])
  const maxDays=Math.max(30,...rows.map(r=>r.days_to_stockout??0))
  const crit=rows.filter(r=>r.status==='critical').length
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-amber-200">📈 Forecast</h1>
        <p className="text-xs text-slate-400 mt-1">Projected days to stock-out per reagent/consumable. {crit>0 && <span className="text-rose-300 font-semibold">{crit} item(s) critical (≤7 days).</span>}</p>
      </div>
      {loading && <div className="text-slate-400 text-sm">Loading…</div>}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
            <th className="px-3 py-2">Item</th><th className="px-3 py-2">Stock</th><th className="px-3 py-2">Est. daily use</th><th className="px-3 py-2 w-1/2">Days to stock-out</th>
          </tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} className="border-b border-slate-800/60">
                <td className="px-3 py-2 text-slate-100">{r.name}</td>
                <td className="px-3 py-2 text-slate-300">{r.stock}</td>
                <td className="px-3 py-2 text-slate-300">{r.est_daily_use}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width:`${Math.min(100,((r.days_to_stockout??maxDays)/maxDays)*100)}%`, background:COL[r.status]??'#64748b' }}/>
                    </div>
                    <span className="text-xs font-mono w-16 text-right" style={{color:COL[r.status]??'#94a3b8'}}>{r.days_to_stockout??'—'} d</span>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length===0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500 text-xs">No inventory items to forecast.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
