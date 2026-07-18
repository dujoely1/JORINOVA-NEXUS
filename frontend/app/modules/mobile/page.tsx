'use client'

/**
 * Staff Mobile Hub — phone-first field screen.
 * Talks to the existing backend router at /api/v1/staff-mobile:
 *   check-in / check-out (with GPS), leave request, inventory request,
 *   field activity, my notifications, my registered devices.
 * Mobile-first single-column layout with large touch targets; every write
 * carries a client txn_id so an offline retry never duplicates.
 */
import { useCallback, useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useI18n } from '../../contexts/I18nProvider'
import type { Lang } from '../../lib/i18n'

const API = process.env.NEXT_PUBLIC_API_URL || ''

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}
function newTxn(): string {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `txn-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function api<T = unknown>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const r = await fetch(`${API}/api/v1/staff-mobile${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { detail?: string }).detail || `HTTP ${r.status}`)
  return data as T
}

/** Resolve the device's GPS position (best-effort — never rejects). */
function getGeo(): Promise<{ latitude?: number; longitude?: number }> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({})
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  })
}

// ── Trilingual copy (kept local so we don't touch the shared dictionary) ───────
type Tab = 'attendance' | 'leave' | 'inventory' | 'field' | 'alerts' | 'devices'
const COPY: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Staff Mobile Hub', sub: 'Field tools for your phone',
    attendance: 'Attendance', leave: 'Leave', inventory: 'Supplies', field: 'Field', alerts: 'Alerts', devices: 'Devices',
    checkin: 'Check in', checkout: 'Check out', locating: 'Locating…', sending: 'Sending…',
    note: 'Note (optional)', gpsOn: 'GPS location attached', gpsOff: 'No GPS — sent without location',
    leaveType: 'Leave type', start: 'Start date', end: 'End date', reason: 'Reason', submit: 'Submit request',
    item: 'Item name', qty: 'Quantity', unit: 'Unit (e.g. box, mL)', request: 'Request supplies',
    actType: 'Activity type', ftitle: 'Title', notes: 'Notes', fileReport: 'File field report',
    noAlerts: 'No notifications', noDevices: 'No registered devices', pending: 'Pending approval', approved: 'Approved',
    ok: 'Done ✓', annual: 'Annual', sick: 'Sick', maternity: 'Maternity', study: 'Study', emergency: 'Emergency',
    outreach: 'Outreach', collection: 'Sample collection', inspection: 'Inspection', geotrack: 'GeoTrack',
    refresh: 'Refresh', lastseen: 'Last seen',
  },
  fr: {
    title: 'Hub Mobile du Personnel', sub: 'Outils de terrain pour votre téléphone',
    attendance: 'Présence', leave: 'Congé', inventory: 'Stock', field: 'Terrain', alerts: 'Alertes', devices: 'Appareils',
    checkin: 'Arrivée', checkout: 'Départ', locating: 'Localisation…', sending: 'Envoi…',
    note: 'Note (facultatif)', gpsOn: 'Position GPS jointe', gpsOff: 'Pas de GPS — envoyé sans position',
    leaveType: 'Type de congé', start: 'Date de début', end: 'Date de fin', reason: 'Motif', submit: 'Envoyer la demande',
    item: 'Nom de l’article', qty: 'Quantité', unit: 'Unité (ex. boîte, mL)', request: 'Demander du stock',
    actType: 'Type d’activité', ftitle: 'Titre', notes: 'Notes', fileReport: 'Envoyer le rapport',
    noAlerts: 'Aucune notification', noDevices: 'Aucun appareil enregistré', pending: 'En attente', approved: 'Approuvé',
    ok: 'Fait ✓', annual: 'Annuel', sick: 'Maladie', maternity: 'Maternité', study: 'Étude', emergency: 'Urgence',
    outreach: 'Sensibilisation', collection: 'Prélèvement', inspection: 'Inspection', geotrack: 'GeoTrack',
    refresh: 'Actualiser', lastseen: 'Vu',
  },
  rw: {
    title: 'Urubuga rw’Abakozi kuri Terefone', sub: 'Ibikoresho byo mu murima kuri terefone yawe',
    attendance: 'Kwitaba', leave: 'Ikiruhuko', inventory: 'Ibikoresho', field: 'Umurima', alerts: 'Amatangazo', devices: 'Ibyuma',
    checkin: 'Injira', checkout: 'Sohoka', locating: 'Turashaka aho uri…', sending: 'Kohereza…',
    note: 'Inyandiko (si ngombwa)', gpsOn: 'Aho uri (GPS) byometse', gpsOff: 'Nta GPS — byoherejwe nta hantu',
    leaveType: 'Ubwoko bw’ikiruhuko', start: 'Itariki itangira', end: 'Itariki irangira', reason: 'Impamvu', submit: 'Ohereza icyifuzo',
    item: 'Izina ry’ikintu', qty: 'Ingano', unit: 'Igipimo (urugero: agasanduku, mL)', request: 'Saba ibikoresho',
    actType: 'Ubwoko bw’igikorwa', ftitle: 'Umutwe', notes: 'Inyandiko', fileReport: 'Ohereza raporo',
    noAlerts: 'Nta matangazo', noDevices: 'Nta cyuma cyanditse', pending: 'Bitegereje kwemezwa', approved: 'Byemejwe',
    ok: 'Byakozwe ✓', annual: 'Buri mwaka', sick: 'Uburwayi', maternity: 'Kubyara', study: 'Amashuri', emergency: 'Byihutirwa',
    outreach: 'Kugera ku baturage', collection: 'Gufata ingero', inspection: 'Igenzura', geotrack: 'GeoTrack',
    refresh: 'Vugurura', lastseen: 'Aheruka',
  },
}

interface Notif { id: number; type: string; title: string; body?: string; priority?: string; is_read: boolean; created_at?: string }
interface Device { id: number; device_name?: string; device_id: string; platform?: string; is_approved: boolean; last_seen?: string }

export default function MobileHubPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Mobile Hub" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const { lang } = useI18n()
  const tr = COPY[lang] || COPY.en
  const [tab, setTab] = useState<Tab>('attendance')
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null)
  const say = (ok: boolean, msg: string) => { setFlash({ ok, msg }); setTimeout(() => setFlash(null), 3500) }

  const TABS: [Tab, string, string][] = [
    ['attendance', tr.attendance, '🕒'],
    ['leave', tr.leave, '🌴'],
    ['inventory', tr.inventory, '📦'],
    ['field', tr.field, '📍'],
    ['alerts', tr.alerts, '🔔'],
    ['devices', tr.devices, '📱'],
  ]

  return (
    <div className="mx-auto w-full max-w-md px-4 py-5">
      <header className="mb-4">
        <h1 className="text-2xl font-extrabold text-emerald-200" style={{ textShadow: '0 0 20px rgba(27,94,32,0.40)' }}>
          📱 {tr.title}
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">{tr.sub}</p>
      </header>

      {flash && (
        <div className={`mb-3 rounded-xl px-3 py-2 text-sm font-medium border ${flash.ok
          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
          : 'bg-rose-500/10 border-rose-500/40 text-rose-200'}`}>
          {flash.msg}
        </div>
      )}

      {/* Segmented tab bar — wraps on small screens, big touch targets */}
      <nav className="mb-4 grid grid-cols-3 gap-1.5">
        {TABS.map(([k, label, icon]) => {
          const on = tab === k
          return (
            <button key={k} onClick={() => setTab(k)}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2.5 text-xs font-semibold border transition-colors
                ${on ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-200'
                     : 'bg-slate-900/50 border-slate-700/50 text-slate-400 active:bg-slate-800'}`}>
              <span className="text-lg">{icon}</span>{label}
            </button>
          )
        })}
      </nav>

      {tab === 'attendance' && <Attendance tr={tr} say={say} />}
      {tab === 'leave' && <Leave tr={tr} say={say} />}
      {tab === 'inventory' && <Inventory tr={tr} say={say} />}
      {tab === 'field' && <Field tr={tr} say={say} />}
      {tab === 'alerts' && <Alerts tr={tr} />}
      {tab === 'devices' && <Devices tr={tr} />}
    </div>
  )
}

type TR = Record<string, string>
type Say = (ok: boolean, msg: string) => void

const card = 'rounded-2xl border border-slate-700/50 bg-slate-900/50 p-4 space-y-3'
const inputCls = 'w-full rounded-xl bg-slate-800/70 border border-slate-700/60 px-3 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60'
const labelCls = 'block text-xs font-semibold text-slate-400 mb-1'
const bigBtn = 'w-full rounded-xl py-3.5 font-bold text-base disabled:opacity-50 transition-colors'

function Attendance({ tr, say }: { tr: TR; say: Say }) {
  const [busy, setBusy] = useState<'' | 'in' | 'out'>('')
  const [note, setNote] = useState('')
  const punch = async (kind: 'in' | 'out') => {
    setBusy(kind)
    try {
      const geo = await getGeo()
      await api(`/check-${kind}`, 'POST', { ...geo, note: note || undefined, txn_id: newTxn() })
      say(true, `${kind === 'in' ? tr.checkin : tr.checkout} — ${tr.ok}${geo.latitude ? ` · ${tr.gpsOn}` : ` · ${tr.gpsOff}`}`)
      setNote('')
    } catch (e) { say(false, (e as Error).message) } finally { setBusy('') }
  }
  return (
    <div className={card}>
      <div>
        <label className={labelCls}>{tr.note}</label>
        <input className={inputCls} value={note} onChange={e => setNote(e.target.value)} placeholder="…" />
      </div>
      <button className={`${bigBtn} bg-emerald-500 text-slate-950 active:bg-emerald-600`} disabled={!!busy} onClick={() => punch('in')}>
        {busy === 'in' ? tr.locating : `🟢 ${tr.checkin}`}
      </button>
      <button className={`${bigBtn} bg-slate-700 text-slate-100 active:bg-slate-600`} disabled={!!busy} onClick={() => punch('out')}>
        {busy === 'out' ? tr.locating : `🔴 ${tr.checkout}`}
      </button>
    </div>
  )
}

function Leave({ tr, say }: { tr: TR; say: Say }) {
  const [type, setType] = useState('ANNUAL')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!start || !end) return say(false, `${tr.start} / ${tr.end}`)
    setBusy(true)
    try {
      await api('/leave-request', 'POST', { leave_type: type, start_date: start, end_date: end, reason: reason || undefined, txn_id: newTxn() })
      say(true, tr.ok); setStart(''); setEnd(''); setReason('')
    } catch (e) { say(false, (e as Error).message) } finally { setBusy(false) }
  }
  const types: [string, string][] = [['ANNUAL', tr.annual], ['SICK', tr.sick], ['MATERNITY', tr.maternity], ['STUDY', tr.study], ['EMERGENCY', tr.emergency]]
  return (
    <div className={card}>
      <div>
        <label className={labelCls}>{tr.leaveType}</label>
        <select className={inputCls} value={type} onChange={e => setType(e.target.value)}>
          {types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{tr.start}</label><input type="date" className={inputCls} value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><label className={labelCls}>{tr.end}</label><input type="date" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} /></div>
      </div>
      <div>
        <label className={labelCls}>{tr.reason}</label>
        <textarea className={inputCls} rows={2} value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      <button className={`${bigBtn} bg-emerald-500 text-slate-950 active:bg-emerald-600`} disabled={busy} onClick={submit}>{busy ? tr.sending : tr.submit}</button>
    </div>
  )
}

function Inventory({ tr, say }: { tr: TR; say: Say }) {
  const [item, setItem] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!item.trim()) return say(false, tr.item)
    setBusy(true)
    try {
      await api('/inventory-request', 'POST', { item_name: item, quantity: parseFloat(qty) || 1, unit: unit || undefined, reason: reason || undefined, txn_id: newTxn() })
      say(true, tr.ok); setItem(''); setQty('1'); setUnit(''); setReason('')
    } catch (e) { say(false, (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className={card}>
      <div><label className={labelCls}>{tr.item}</label><input className={inputCls} value={item} onChange={e => setItem(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>{tr.qty}</label><input type="number" min="0" step="any" className={inputCls} value={qty} onChange={e => setQty(e.target.value)} /></div>
        <div><label className={labelCls}>{tr.unit}</label><input className={inputCls} value={unit} onChange={e => setUnit(e.target.value)} /></div>
      </div>
      <div><label className={labelCls}>{tr.reason}</label><textarea className={inputCls} rows={2} value={reason} onChange={e => setReason(e.target.value)} /></div>
      <button className={`${bigBtn} bg-emerald-500 text-slate-950 active:bg-emerald-600`} disabled={busy} onClick={submit}>{busy ? tr.sending : tr.request}</button>
    </div>
  )
}

function Field({ tr, say }: { tr: TR; say: Say }) {
  const [type, setType] = useState('OUTREACH')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      const geo = await getGeo()
      await api('/field-activity', 'POST', { activity_type: type, title: title || undefined, notes: notes || undefined, ...geo, txn_id: newTxn() })
      say(true, `${tr.ok}${geo.latitude ? ` · ${tr.gpsOn}` : ''}`); setTitle(''); setNotes('')
    } catch (e) { say(false, (e as Error).message) } finally { setBusy(false) }
  }
  const types: [string, string][] = [['OUTREACH', tr.outreach], ['COLLECTION', tr.collection], ['INSPECTION', tr.inspection], ['GEOTRACK', tr.geotrack]]
  return (
    <div className={card}>
      <div>
        <label className={labelCls}>{tr.actType}</label>
        <select className={inputCls} value={type} onChange={e => setType(e.target.value)}>
          {types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div><label className={labelCls}>{tr.ftitle}</label><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div><label className={labelCls}>{tr.notes}</label><textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></div>
      <button className={`${bigBtn} bg-emerald-500 text-slate-950 active:bg-emerald-600`} disabled={busy} onClick={submit}>{busy ? tr.sending : `📍 ${tr.fileReport}`}</button>
    </div>
  )
}

function Alerts({ tr }: { tr: TR }) {
  const [rows, setRows] = useState<Notif[] | null>(null)
  const load = useCallback(() => { api<Notif[]>('/notifications', 'GET').then(setRows).catch(() => setRows([])) }, [])
  useEffect(() => { load() }, [load])
  if (rows === null) return <div className={card}><div className="text-slate-500 text-sm">…</div></div>
  if (!rows.length) return <div className={card}><div className="text-slate-500 text-sm text-center py-4">{tr.noAlerts}</div></div>
  return (
    <div className="space-y-2">
      {rows.map(n => (
        <div key={n.id} className={`rounded-xl border p-3 ${n.is_read ? 'border-slate-700/40 bg-slate-900/40' : 'border-emerald-500/40 bg-emerald-500/5'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100 text-sm">{n.title}</span>
            {n.priority && <span className="text-[10px] uppercase tracking-wide text-amber-300">{n.priority}</span>}
          </div>
          {n.body && <p className="text-xs text-slate-400 mt-1">{n.body}</p>}
        </div>
      ))}
    </div>
  )
}

function Devices({ tr }: { tr: TR }) {
  const [rows, setRows] = useState<Device[] | null>(null)
  useEffect(() => { api<Device[]>('/devices', 'GET').then(setRows).catch(() => setRows([])) }, [])
  if (rows === null) return <div className={card}><div className="text-slate-500 text-sm">…</div></div>
  if (!rows.length) return <div className={card}><div className="text-slate-500 text-sm text-center py-4">{tr.noDevices}</div></div>
  return (
    <div className="space-y-2">
      {rows.map(d => (
        <div key={d.id} className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-100 text-sm">{d.device_name || d.device_id.slice(0, 12)}</div>
            <div className="text-[11px] text-slate-500">{d.platform || 'android'}</div>
          </div>
          <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${d.is_approved ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
            {d.is_approved ? tr.approved : tr.pending}
          </span>
        </div>
      ))}
    </div>
  )
}
