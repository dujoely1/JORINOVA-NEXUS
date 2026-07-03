'use client'

/**
 * Smart Inventory charts — category donut + expiry histogram + stock status.
 * Inline SVG (offline-safe, no chart library). Colours use the validated
 * dark-mode data-viz palette (categorical fixed order; status reserved).
 * GET /api/v1/ops/inventory/chart-stats.
 */
import { useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
function tok(){ if(typeof window==='undefined') return null
  return document.cookie.split('; ').find(r=>r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token') }

// validated dark-mode palette (fixed categorical order + reserved status hues)
const CAT = ['#3987e5','#199e70','#c98500','#9085e9','#e66767','#d55181','#d95926','#008300']
const STATUS: Record<string,{c:string;label:string;icon:string}> = {
  ok:  { c:'#0ca30c', label:'In stock',     icon:'●' },
  low: { c:'#fab219', label:'Low stock',    icon:'▲' },
  out: { c:'#d03b3b', label:'Out of stock', icon:'■' },
}
const EXPIRY: Record<string,string> = { 'expired':'#d03b3b','<30d':'#ec835a','30-90d':'#fab219','90-180d':'#199e70','>180d':'#0ca30c' }

interface Slice { label:string; value:number }
interface Stats { by_category:Slice[]; by_status:Slice[]; expiry_buckets:Slice[]; total:number }

export default function InventoryCharts(){
  const [s,setS]=useState<Stats|null>(null)
  useEffect(()=>{ const t=tok()
    fetch(`${API}/api/v1/ops/inventory/chart-stats`,{headers:t?{Authorization:`Bearer ${t}`}:{}})
      .then(r=>r.ok?r.json():null).then(setS).catch(()=>{}) },[])
  if(!s) return null
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
        <h3 className="text-sm font-bold text-emerald-300 mb-3">Stock by category</h3>
        <Donut data={s.by_category} total={s.total} />
        <StatusRow data={s.by_status} />
      </div>
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
        <h3 className="text-sm font-bold text-emerald-300 mb-3">Items by time to expiry</h3>
        <Histogram data={s.expiry_buckets} />
      </div>
    </section>
  )
}

function Donut({ data, total }:{ data:Slice[]; total:number }){
  const sum = data.reduce((a,d)=>a+d.value,0) || 1
  const R=52, C=2*Math.PI*R
  let off=0
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Stock by category">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#1e293b" strokeWidth="16" />
        {data.map((d,i)=>{
          const frac=d.value/sum, len=frac*C
          const el=(
            <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={CAT[i%CAT.length]} strokeWidth="16"
              strokeDasharray={`${len} ${C-len}`} strokeDashoffset={-off}
              transform="rotate(-90 70 70)" strokeLinecap="butt">
              <title>{d.label}: {d.value} ({Math.round(frac*100)}%)</title>
            </circle>)
          off+=len; return el
        })}
        <text x="70" y="66" textAnchor="middle" className="fill-slate-100" style={{fontSize:'22px',fontWeight:800}}>{total}</text>
        <text x="70" y="84" textAnchor="middle" className="fill-slate-400" style={{fontSize:'9px'}}>items</text>
      </svg>
      <ul className="text-xs space-y-1">
        {data.map((d,i)=>(
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{background:CAT[i%CAT.length]}}/>
            <span className="text-slate-200 capitalize">{d.label}</span>
            <span className="text-slate-500 tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatusRow({ data }:{ data:Slice[] }){
  return (
    <div className="flex gap-2 mt-4 flex-wrap">
      {data.map(d=>{ const st=STATUS[d.label]; if(!st) return null
        return (
          <div key={d.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border" style={{borderColor:`${st.c}55`,background:`${st.c}18`}}>
            <span style={{color:st.c}}>{st.icon}</span>
            <span className="text-xs text-slate-200">{st.label}</span>
            <span className="text-xs font-bold tabular-nums" style={{color:st.c}}>{d.value}</span>
          </div>)
      })}
    </div>
  )
}

function Histogram({ data }:{ data:Slice[] }){
  const max=Math.max(1,...data.map(d=>d.value))
  const W=340, H=150, pad=24, bw=(W-pad*2)/data.length
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H+30}`} role="img" aria-label="Items by time to expiry">
      <line x1={pad} y1={H} x2={W-pad} y2={H} stroke="#383835" strokeWidth="1" />
      {data.map((d,i)=>{
        const h=(d.value/max)*(H-pad), x=pad+i*bw+bw*0.18, y=H-h, w=bw*0.64
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={Math.max(h,d.value>0?2:0)} rx="4" fill={EXPIRY[d.label]??'#64748b'}>
              <title>{d.label}: {d.value} item(s)</title>
            </rect>
            {d.value>0 && <text x={x+w/2} y={y-4} textAnchor="middle" className="fill-slate-200" style={{fontSize:'10px',fontWeight:700}}>{d.value}</text>}
            <text x={x+w/2} y={H+14} textAnchor="middle" className="fill-slate-400" style={{fontSize:'9px'}}>{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}
