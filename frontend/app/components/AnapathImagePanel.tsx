'use client'

/**
 * AnapathImagePanel — per-patient pathology image cadre.
 *
 * Pick a patient (PID / name / NID / LID), then see all their images and add
 * more by: file upload, or live capture from the device / microscope / imaging
 * camera. Each image is tagged (microscopy / macroscopy / imaging / upload).
 * Images are compressed client-side and stored in the DB (persist across
 * redeploys), served from /api/v1/public/anapath-image/{id}.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const TYPES = ['microscopy', 'macroscopy', 'imaging', 'upload'] as const

function authHeader(extra?: HeadersInit): HeadersInit {
  const tok = typeof window !== 'undefined'
    ? (document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1] ?? localStorage.getItem('access_token'))
    : null
  return { ...(extra || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }
}

type Patient = { id: number; pid: string; family_name?: string; other_names?: string; unique_lab_id?: string }
type Img = { id: number; url: string; image_type: string; caption?: string | null; created_at?: string | null }

async function compress(src: Blob, maxDim = 1600, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(src)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url
    })
    let w = img.width, h = img.height
    const m = Math.max(w, h)
    if (m > maxDim) { const s = maxDim / m; w = Math.round(w * s); h = Math.round(h * s) }
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', quality))
  } finally { URL.revokeObjectURL(url) }
}

export default function AnapathImagePanel() {
  const [q, setQ]             = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [patient, setPatient] = useState<Patient | null>(null)
  const [images, setImages]   = useState<Img[]>([])
  const [imageType, setImageType] = useState<string>('microscopy')
  const [caption, setCaption] = useState('')
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState('')
  const [full, setFull]       = useState<string | null>(null)
  const [cam, setCam]         = useState(false)
  const fileRef  = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCam = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; setCam(false) }, [])
  useEffect(() => () => stopCam(), [stopCam])

  // Patient search (debounced)
  useEffect(() => {
    if (patient || q.trim().length < 2) { setResults([]); return }
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/v1/patients/?search=${encodeURIComponent(q)}&limit=8`, { headers: authHeader() })
        if (r.ok) setResults(await r.json())
      } catch { /* ignore */ }
    }, 300)
    return () => clearTimeout(id)
  }, [q, patient])

  const loadImages = useCallback(async (pid: number) => {
    try {
      const r = await fetch(`${API}/api/v1/anapath/images?patient_id=${pid}`, { headers: authHeader() })
      if (r.ok) setImages(await r.json())
    } catch { /* ignore */ }
  }, [])

  function pick(p: Patient) { setPatient(p); setResults([]); setQ(''); void loadImages(p.id) }

  async function send(blob: Blob) {
    if (!patient) return
    setBusy(true); setErr('')
    try {
      const small = await compress(blob)
      const fd = new FormData(); fd.append('file', small, 'anapath.jpg')
      const url = `${API}/api/v1/anapath/images?patient_id=${patient.id}&image_type=${imageType}` +
                  (caption ? `&caption=${encodeURIComponent(caption)}` : '')
      const r = await fetch(url, { method: 'POST', headers: authHeader(), body: fd })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      setCaption(''); await loadImages(patient.id)
    } catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  async function startCam() {
    setErr('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false })
      streamRef.current = s; setCam(true)
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}) } }, 50)
    } catch { setErr('Camera not available or permission denied') }
  }
  async function capture() {
    const v = videoRef.current; if (!v) return
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    stopCam()
    const blob: Blob = await new Promise(res => c.toBlob(b => res(b!), 'image/jpeg', 0.9))
    await send(blob)
  }

  async function del(id: number) {
    if (!confirm('Delete this image?')) return
    try {
      const r = await fetch(`${API}/api/v1/anapath/images/${id}`, { method: 'DELETE', headers: authHeader() })
      if (r.ok && patient) await loadImages(patient.id)
    } catch { /* ignore */ }
  }

  const pname = (p: Patient) => `${p.pid} · ${[p.family_name, p.other_names].filter(Boolean).join(' ') || '—'}`

  return (
    <section className="rounded-xl border border-purple-700/40 bg-slate-900/60 p-4 mb-5">
      <h3 className="text-sm font-bold text-purple-200 mb-3">🖼️ Image Analysis — patient image cadre</h3>

      {/* Patient picker */}
      {!patient ? (
        <div className="relative">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search patient by PID / name / NID / LID…"
                 className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500" />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 shadow-xl max-h-56 overflow-y-auto">
              {results.map(p => (
                <button key={p.id} onClick={() => pick(p)} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">{pname(p)}</button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
          <span className="text-sm text-slate-200">👤 {pname(patient)}</span>
          <button onClick={() => { setPatient(null); setImages([]) }} className="text-xs text-sky-300 hover:underline">change</button>
        </div>
      )}

      {err && <div className="mt-3 rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">{err}</div>}

      {patient && (
        <>
          {/* Add controls */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select value={imageType} onChange={e => setImageType(e.target.value)} className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-sm text-slate-100">
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption (optional)"
                   className="flex-1 min-w-[160px] bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500" />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 disabled:opacity-50">📁 Upload</button>
            <button onClick={startCam} disabled={busy} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">📷 Capture</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void send(f) }} />
          </div>
          {busy && <div className="mt-2 text-xs text-slate-400">Uploading…</div>}

          {/* Gallery */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.length === 0 && <div className="col-span-full text-sm text-slate-500 py-6 text-center">No images yet for this patient.</div>}
            {images.map(im => (
              <div key={im.id} className="relative group rounded-lg overflow-hidden ring-1 ring-slate-700 bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${API}${im.url}`} alt={im.caption || im.image_type} onClick={() => setFull(`${API}${im.url}`)}
                     className="h-32 w-full object-cover cursor-zoom-in" />
                <div className="absolute top-1 left-1 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-black/60 text-purple-200">{im.image_type}</div>
                <button onClick={() => del(im.id)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-rose-300 opacity-0 group-hover:opacity-100">✕</button>
                {im.caption && <div className="px-2 py-1 text-[11px] text-slate-300 truncate">{im.caption}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Camera modal */}
      {cam && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={stopCam}>
          <div className="bg-slate-900 rounded-2xl p-4 flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <video ref={videoRef} playsInline muted className="max-h-[70vh] max-w-[90vw] rounded-lg bg-black" />
            <div className="flex gap-2">
              <button onClick={capture} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold">📸 Capture</button>
              <button onClick={stopCam} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-100 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen */}
      {full && (
        <div className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-4" onClick={() => setFull(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={full} alt="full" className="max-h-[90vh] max-w-[95vw] rounded-lg" />
        </div>
      )}
    </section>
  )
}
