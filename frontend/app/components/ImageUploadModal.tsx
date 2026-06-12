'use client'

/**
 * ImageUploadModal — drop or pick an image (microscopy slide, lab form,
 * gel, etc.), upload it to POST /api/v1/ai/vision/submit, then poll
 * GET /api/v1/ai/vision/{task_id} until the AI returns an interpretation.
 *
 * Shown via the floating ModuleToolbar 📷 button on every module page.
 */

import { useEffect, useRef, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(extra?: HeadersInit): HeadersInit {
  const t = getToken(); return { ...(extra || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

const IMAGE_TYPES = [
  { v: 'microscopy', label: 'Microscopy slide (smear, PAP, AFB, malaria)' },
  { v: 'culture',    label: 'Culture plate (colony / antibiogram)' },
  { v: 'histology',  label: 'Histology / H&E slide' },
  { v: 'gel',        label: 'PCR / electrophoresis gel' },
  { v: 'form',       label: 'Lab request form (OCR)' },
  { v: 'other',      label: 'Other clinical image' },
]

export default function ImageUploadModal({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imageType, setImageType] = useState('microscopy')
  const [priority,  setPriority]  = useState('routine')
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [drag, setDrag] = useState(false)

  // Build preview URL when file picked
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function pick(f: File | null | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) { setErr('Please pick an image file.'); return }
    if (f.size > 12 * 1024 * 1024)    { setErr('Image must be smaller than 12 MB.'); return }
    setErr(null); setResult(null); setTaskId(null); setFile(f)
  }

  async function submit() {
    if (!file) return
    setBusy(true); setErr(null); setResult(null)
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('image_type', imageType)
      fd.append('priority',   priority)
      const r = await fetch(`${API}/api/v1/ai/vision/submit`, {
        method: 'POST',
        headers: authHeaders(),     // do NOT set Content-Type — browser sets the multipart boundary
        body: fd,
      })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      const tid = j.task_id || j.payload?.task_id || j.metadata?.task_id || ''
      if (tid) setTaskId(tid)
      // The submit endpoint can return the result inline (sync) or a task_id (async). Show whatever came back.
      setResult(j)
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }

  // Poll until result is ready
  useEffect(() => {
    if (!taskId) return
    let stop = false
    const poll = async () => {
      while (!stop) {
        try {
          const r = await fetch(`${API}/api/v1/ai/vision/${taskId}`, { headers: authHeaders() })
          if (r.ok) {
            const j = await r.json()
            if (j && j.status !== 'pending' && j.status !== 'queued') {
              if (!stop) setResult(j)
              return
            }
          }
        } catch { /* keep polling */ }
        await new Promise(r => setTimeout(r, 1500))
      }
    }
    poll()
    return () => { stop = true }
  }, [taskId])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-sky-400/40 rounded-2xl max-w-2xl w-full p-5 shadow-2xl"
           style={{ boxShadow: '0 0 40px rgba(56,189,248,0.18)' }}>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-lg font-bold text-sky-200">📷 AI Image Interpretation</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl">×</button>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          Upload a microscopy slide, culture plate, gel, or lab form. AI Nexus reads it and returns an interpretation. Hands the original to the pathologist for sign-off — never auto-validates a diagnosis.
        </p>

        {/* Picker / dropzone */}
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed cursor-pointer text-center px-4 py-6 transition-colors
            ${drag ? 'border-sky-400 bg-sky-500/10' : 'border-slate-600 bg-slate-800/40 hover:bg-slate-800/60'}`}
        >
          {preview
            ? <img src={preview} alt="preview" className="max-h-48 mx-auto rounded-lg border border-slate-600" />
            : <>
                <div className="text-3xl mb-2">📤</div>
                <div className="text-sm text-slate-300">Drag &amp; drop an image here, or click to pick from your computer</div>
                <div className="text-[11px] text-slate-500 mt-1">JPG / PNG / WebP — up to 12 MB</div>
              </>}
          <input ref={inputRef} type="file" accept="image/*" hidden
                 onChange={e => pick(e.target.files?.[0])} />
        </div>
        {file && (
          <div className="text-xs text-slate-400 mt-1.5 text-center">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
            <button onClick={() => { setFile(null); setPreview(null) }}
              className="ml-2 underline text-slate-500 hover:text-rose-300">remove</button>
          </div>
        )}

        {/* Type + priority */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <label className="text-xs text-slate-300">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">Image type</div>
            <select value={imageType} onChange={e => setImageType(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full">
              {IMAGE_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">Priority</div>
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full">
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
          </label>
        </div>

        {err && <div className="mt-3 rounded-md bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-xs text-rose-200">⚠ {err}</div>}

        {/* Result */}
        {result && (
          <div className="mt-4 rounded-lg border border-emerald-400/30 bg-slate-800/40 p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-300 mb-2">
              AI response {taskId && <span className="text-slate-500 ml-2">task #{taskId}</span>}
            </div>
            {typeof result?.content === 'string'
              ? <div className="text-sm text-slate-200 whitespace-pre-wrap">{result.content}</div>
              : <pre className="text-[11px] text-slate-200 whitespace-pre-wrap break-words font-mono max-h-72 overflow-y-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-600">
            Close
          </button>
          <button onClick={submit} disabled={busy || !file}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50">
            {busy ? 'Submitting…' : 'Analyse with AI'}
          </button>
        </div>
      </div>
    </div>
  )
}
