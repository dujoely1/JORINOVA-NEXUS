'use client'

/**
 * ProfilePhotoEditor — full profile-photo management modal.
 *
 * Sources : upload from computer · drag & drop · device/mobile camera capture
 * Editing : zoom · pan (drag) · rotate 90° · square crop · auto-resize 512²
 *           · JPEG compression
 * Manage  : save · remove · download · view full screen
 *
 * Uploads to POST /api/v1/admin/users/{uid}/photo (FormData, field 'file'),
 * removes via DELETE the same path. Calls onChanged() after any change so the
 * caller can refresh the header avatar.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const OUT = 512          // output square (px)
const PV  = 288          // preview square (px)

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeader(): HeadersInit {
  const tok = getToken()
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

type Props = {
  uid: number
  currentPhoto?: string | null
  name: string
  onClose: () => void
  onChanged: () => void
}

export default function ProfilePhotoEditor({ uid, currentPhoto, name, onClose, onChanged }: Props) {
  const [img, setImg]   = useState<HTMLImageElement | null>(null)
  const [rot, setRot]   = useState(0)
  const [zoom, setZoom] = useState(1)
  const [off, setOff]   = useState({ x: 0, y: 0 })
  const [mode, setMode] = useState<'pick' | 'camera' | 'edit'>('pick')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [full, setFull] = useState(false)
  const [history, setHistory] = useState<{ id: number; url: string; created_at: string | null }[]>([])
  const [locked, setLocked] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const last      = useRef({ x: 0, y: 0 })

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/admin/users/${uid}/photo-history`, { headers: authHeader() })
      if (!r.ok) return
      const d = await r.json()
      setHistory(d.history || [])
      setLocked(!!d.locked)
    } catch { /* ignore */ }
  }, [uid])
  useEffect(() => { void loadHistory() }, [loadHistory])

  async function restore(hid: number) {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`${API}/api/v1/admin/users/${uid}/photo-history/${hid}/restore`, { method: 'POST', headers: authHeader() })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      onChanged(); onClose()
    } catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  // Load a File / data-URL into an <img> and switch to edit mode.
  const loadSrc = useCallback((src: string) => {
    const im = new Image()
    im.onload = () => { setImg(im); setRot(0); setZoom(1); setOff({ x: 0, y: 0 }); setMode('edit'); setErr(null) }
    im.onerror = () => setErr('Could not read image')
    im.src = src
  }, [])

  function onFile(file?: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Please choose an image (JPG, PNG, WEBP)'); return }
    const reader = new FileReader()
    reader.onload = () => loadSrc(String(reader.result))
    reader.readAsDataURL(file)
  }

  async function startCamera() {
    setErr(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = s
      setMode('camera')
      // attach after render
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}) } }, 50)
    } catch {
      setErr('Camera not available or permission denied')
    }
  }

  function capture() {
    const v = videoRef.current
    if (!v) return
    const c = document.createElement('canvas')
    const sq = Math.min(v.videoWidth, v.videoHeight)
    c.width = sq; c.height = sq
    const ctx = c.getContext('2d')!
    ctx.drawImage(v, (v.videoWidth - sq) / 2, (v.videoHeight - sq) / 2, sq, sq, 0, 0, sq, sq)
    stopCamera()
    loadSrc(c.toDataURL('image/jpeg', 0.92))
  }

  // Draw the image into a square canvas with current rotate/zoom/pan.
  const draw = useCallback((ctx: CanvasRenderingContext2D, size: number, im: HTMLImageElement, scale = 1) => {
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#0a1b2e'; ctx.fillRect(0, 0, size, size)
    const base = Math.max(size / im.width, size / im.height)
    const s = base * zoom
    ctx.save()
    ctx.translate(size / 2 + off.x * scale, size / 2 + off.y * scale)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.scale(s, s)
    ctx.drawImage(im, -im.width / 2, -im.height / 2)
    ctx.restore()
  }, [rot, zoom, off])

  // Live preview
  useEffect(() => {
    if (mode !== 'edit' || !img || !canvasRef.current) return
    draw(canvasRef.current.getContext('2d')!, PV, img, 1)
  }, [mode, img, draw])

  async function save() {
    if (!img) return
    setBusy(true); setErr(null)
    try {
      const out = document.createElement('canvas')
      out.width = OUT; out.height = OUT
      draw(out.getContext('2d')!, OUT, img, OUT / PV)   // same framing, scaled to output
      const blob: Blob = await new Promise((res, rej) =>
        out.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.85))
      const fd = new FormData()
      fd.append('file', blob, `avatar_${uid}.jpg`)
      const r = await fetch(`${API}/api/v1/admin/users/${uid}/photo`, { method: 'POST', headers: authHeader(), body: fd })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      onChanged(); onClose()
    } catch (e: any) {
      setErr(String(e.message || e))
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!confirm('Remove your profile photo?')) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`${API}/api/v1/admin/users/${uid}/photo`, { method: 'DELETE', headers: authHeader() })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      onChanged(); onClose()
    } catch (e: any) {
      setErr(String(e.message || e))
    } finally { setBusy(false) }
  }

  function download() {
    if (!currentPhoto) return
    const a = document.createElement('a')
    a.href = currentPhoto.startsWith('/') ? `${API}${currentPhoto}` : currentPhoto
    a.download = `${name.replace(/\s+/g, '_')}_avatar.jpg`; a.target = '_blank'; a.click()
  }

  // Pan handlers
  function onDown(e: React.PointerEvent) { setDrag(true); last.current = { x: e.clientX, y: e.clientY } }
  function onMove(e: React.PointerEvent) {
    if (!drag) return
    setOff(o => ({ x: o.x + (e.clientX - last.current.x), y: o.y + (e.clientY - last.current.y) }))
    last.current = { x: e.clientX, y: e.clientY }
  }
  function onUp() { setDrag(false) }

  const photoSrc = currentPhoto ? (currentPhoto.startsWith('/') ? `${API}${currentPhoto}` : currentPhoto) : null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-slate-100">Profile photo</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {err && <div className="mb-3 rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">{err}</div>}

        {/* PICK mode */}
        {mode === 'pick' && (
          <>
            <div className="flex flex-col items-center gap-3">
              {photoSrc
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={photoSrc} alt={name} className="h-28 w-28 rounded-full object-cover ring-2 ring-slate-600" />
                : <div className="h-28 w-28 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-3xl">👤</div>}
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]) }}
              className={`mt-4 rounded-xl border-2 border-dashed p-5 text-center text-sm ${drag ? 'border-sky-400 bg-sky-400/10' : 'border-slate-600'}`}
            >
              <div className="text-slate-300">Drag &amp; drop an image here</div>
              <div className="text-slate-500 text-xs mt-0.5">JPG · PNG · WEBP</div>
            </div>
            {locked && (
              <div className="mt-3 rounded-lg bg-amber-900/30 border border-amber-700/50 px-3 py-2 text-xs text-amber-200">
                🔒 Your profile photo is locked by an administrator. Contact an admin to change it.
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={locked} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 disabled:opacity-40">📁 Upload</button>
              <button onClick={startCamera} disabled={locked} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40">📷 Camera</button>
              {photoSrc && <button onClick={() => setFull(true)} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-100 text-sm hover:bg-slate-600">🔍 View</button>}
              {photoSrc && <button onClick={download} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-100 text-sm hover:bg-slate-600">⬇ Download</button>}
              {photoSrc && <button onClick={remove} disabled={busy || locked} className="col-span-2 px-3 py-2 rounded-lg bg-rose-700/80 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40">🗑 Remove photo</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => onFile(e.target.files?.[0])} />

            {history.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">Previous photos — tap to restore</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {history.map(h => (
                    <button key={h.id} onClick={() => !locked && restore(h.id)} disabled={busy || locked} title={h.created_at || ''}
                      className="shrink-0 rounded-lg overflow-hidden ring-1 ring-slate-600 hover:ring-sky-400 disabled:opacity-40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.url.startsWith('/') ? `${API}${h.url}` : h.url} alt="previous" className="h-14 w-14 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* CAMERA mode */}
        {mode === 'camera' && (
          <div className="flex flex-col items-center gap-3">
            <video ref={videoRef} playsInline muted className="w-64 h-64 rounded-xl object-cover bg-black" />
            <div className="flex gap-2">
              <button onClick={capture} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">📸 Capture</button>
              <button onClick={() => { stopCamera(); setMode('pick') }} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-100 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* EDIT mode */}
        {mode === 'edit' && img && (
          <div className="flex flex-col items-center gap-3">
            <canvas
              ref={canvasRef} width={PV} height={PV}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
              className="rounded-full ring-2 ring-slate-600 cursor-move touch-none"
              style={{ width: PV, height: PV }}
            />
            <div className="text-[11px] text-slate-400 -mt-1">Drag to reposition</div>
            <div className="w-full flex items-center gap-2">
              <span className="text-xs text-slate-400">Zoom</span>
              <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="flex-1" />
              <button onClick={() => setRot(r => (r + 90) % 360)} className="px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-100 text-sm" title="Rotate">↻</button>
            </div>
            <div className="w-full grid grid-cols-2 gap-2 mt-1">
              <button onClick={() => { setMode('pick'); setImg(null) }} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-100 text-sm">Back</button>
              <button onClick={save} disabled={busy} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">{busy ? 'Saving…' : 'Save photo'}</button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen view */}
      {full && photoSrc && (
        <div className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-4" onClick={() => setFull(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoSrc} alt={name} className="max-h-[85vh] max-w-[90vw] rounded-xl" />
        </div>
      )}
    </div>
  )
}
