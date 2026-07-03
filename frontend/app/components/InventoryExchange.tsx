'use client'

/**
 * Inter-hospital exchange — offer near-expiry stock to other facilities that
 * will use it soon. JORINOVA AI reads the RBC dashboard (read-only) to show
 * which hospitals need which categories, so stock is routed before it expires.
 * GET /ops/inventory/near-expiry · /ops/rbc/hospitals · GET/POST /ops/exchange/offers.
 */
import { useCallback, useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
function tok(){ if(typeof window==='undefined') return null
  return document.cookie.split('; ').find(r=>r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token') }
function H(json=false):HeadersInit{ const t=tok(); return { ...(json?{'Content-Type':'application/json'}:{}), ...(t?{Authorization:`Bearer ${t}`}:{}) } }

interface Near { id:number; name:string; category:string|null; quantity:number; unit:string|null; lot_number:string|null; expiry_date:string|null; days_left:number|null }
interface Hosp { hospital:string; district:string; needs:string[]; status:string }
interface Offer { id:number; item_name:string; quantity:number; to_hospital:string|null; expiry_date:string|null; status:string }

export default function InventoryExchange(){
  const [near,setNear]=useState<Near[]>([])
  const [hosp,setHosp]=useState<Hosp[]>([])
  const [offers,setOffers]=useState<Offer[]>([])
  const [msg,setMsg]=useState<string|null>(null)

  const load=useCallback(async()=>{
    try{
      const [n,h,o]=await Promise.all([
        fetch(`${API}/api/v1/ops/inventory/near-expiry?days=120`,{headers:H()}).then(r=>r.ok?r.json():[]),
        fetch(`${API}/api/v1/ops/rbc/hospitals`,{headers:H()}).then(r=>r.ok?r.json():[]),
        fetch(`${API}/api/v1/ops/exchange/offers`,{headers:H()}).then(r=>r.ok?r.json():[]),
      ])
      setNear(n); setHosp(h); setOffers(o)
    }catch{}
  },[])
  useEffect(()=>{ void load() },[load])

  // AI suggestion: match a near-expiry item's category to a hospital that needs it
  function suggestHospital(cat:string|null):string{
    const m=hosp.find(h=>cat && h.needs.includes(cat)) ?? hosp.find(h=>h.status==='critical') ?? hosp[0]
    return m?.hospital ?? ''
  }
  async function offer(it:Near){
    const to=suggestHospital(it.category)
    setMsg(null)
    try{
      const r=await fetch(`${API}/api/v1/ops/exchange/offers`,{method:'POST',headers:H(true),
        body:JSON.stringify({item_name:it.name,category:it.category,quantity:it.quantity,unit:it.unit,expiry_date:it.expiry_date,lot_number:it.lot_number,to_hospital:to})})
      setMsg(r.ok?`✅ Offered ${it.name} → ${to}`:'⚠ failed'); await load()
    }catch{ setMsg('⚠ backend not reachable') }
  }

  return (
    <section className="rounded-xl border border-amber-400/30 bg-slate-900/60 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-amber-300">🔄 Inter-hospital exchange (near-expiry)</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Send items about to expire to hospitals that will use them soon. AI reads the RBC dashboard (read-only) to suggest the destination.</p>
      </div>
      {msg && <div className="text-xs px-3 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 overflow-x-auto">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Near-expiry stock</div>
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="text-left text-[11px] text-slate-400 border-b border-slate-700/60"><th className="py-1.5 pr-2">Item</th><th className="pr-2">Qty</th><th className="pr-2">Expiry</th><th className="pr-2">Left</th><th></th></tr></thead>
            <tbody>
              {near.map(it=>(
                <tr key={it.id} className="border-b border-slate-800/60">
                  <td className="py-1.5 pr-2 text-slate-100">{it.name}<span className="text-slate-500 text-xs"> · {it.category??'—'}</span></td>
                  <td className="pr-2 text-slate-300 tabular-nums">{it.quantity}{it.unit?` ${it.unit}`:''}</td>
                  <td className="pr-2 text-slate-300">{it.expiry_date??'—'}</td>
                  <td className="pr-2"><span className={`text-xs font-semibold ${it.days_left!=null&&it.days_left<=30?'text-rose-300':it.days_left!=null&&it.days_left<=60?'text-amber-300':'text-slate-300'}`}>{it.days_left??'—'} d</span></td>
                  <td className="text-right"><button onClick={()=>offer(it)} className="text-xs px-2.5 py-1 rounded-lg border border-amber-400/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/30">Offer</button></td>
                </tr>
              ))}
              {near.length===0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500 text-xs">No near-expiry items.</td></tr>}
            </tbody>
          </table>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">RBC dashboard · other hospitals (read-only)</div>
          <div className="space-y-1.5">
            {hosp.map(h=>(
              <div key={h.hospital} className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-2.5 py-1.5">
                <div className="text-xs text-slate-100 font-medium">{h.hospital}</div>
                <div className="text-[10px] text-slate-400">{h.district} · needs: {h.needs.join(', ')} <span className={h.status==='critical'?'text-rose-300':h.status==='low'?'text-amber-300':'text-emerald-300'}>· {h.status}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {offers.length>0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Offers sent</div>
          <div className="flex flex-wrap gap-1.5">
            {offers.map(o=>(
              <span key={o.id} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-600 text-slate-200">{o.item_name} → {o.to_hospital??'—'} · <span className="text-amber-300">{o.status}</span></span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
