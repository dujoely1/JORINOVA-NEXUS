'use client'

/**
 * Voice Biometric Training — enrol the user's voice so hands-free voice
 * commands are secured to them. Records short audio samples with the browser
 * MediaRecorder and uploads each to the backend, then submits for admin
 * approval.
 *
 * Backend: /api/v1/voice-bio/{status, enroll/start, enroll/sample, enroll/confirm}
 * Fixes the previous 404 at /security/voice-training (no Next page existed).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL || ''

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit {
  const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}
}

interface Session { token: string; phrases: string[]; samplesNeeded: number }

export default function VoiceTrainingPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Voice Training" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [status, setStatus]   = useState<any>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [done, setDone]       = useState<boolean[]>([])
  const [recording, setRecording] = useState<number | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)

  const loadStatus = useCallback(() => {
    fetch(`${API}/api/v1/voice-bio/status`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setStatus)
      .catch(e => setErr(String(e)))
  }, [])
  useEffect(loadStatus, [loadStatus])

  async function start() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`${API}/api/v1/voice-bio/enroll/start`, { method: 'POST', headers: authHeaders() })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`)
      const j = await r.json()
      setSession({ token: j.session_token, phrases: j.phrases || [], samplesNeeded: j.samples_needed })
      setDone(new Array((j.phrases || []).length).fill(false))
    } catch (e: any) { setErr(e.message || String(e)) }
    finally { setBusy(false) }
  }

  async function recordSample(idx: number) {
    if (!session) return
    setErr(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch { setErr(t('vt.mic_denied')); return }

    const chunks: BlobPart[] = []
    const rec = new MediaRecorder(stream)
    recRef.current = rec
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise<void>(res => { rec.onstop = () => res() })
    rec.start()
    setRecording(idx)
    // Record ~4s then auto-stop.
    await new Promise(r => setTimeout(r, 4000))
    try { rec.stop() } catch { /* noop */ }
    await stopped
    stream.getTracks().forEach(tk => tk.stop())
    setRecording(null)

    const blob = new Blob(chunks, { type: 'audio/webm' })
    setUploading(idx)
    try {
      const fd = new FormData()
      fd.append('session_token', session.token)
      fd.append('phrase_index', String(idx))
      fd.append('audio', blob, `sample_${idx}.webm`)
      const r = await fetch(`${API}/api/v1/voice-bio/enroll/sample`, { method: 'POST', headers: authHeaders(), body: fd })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`)
      setDone(d => { const n = [...d]; n[idx] = true; return n })
    } catch (e: any) { setErr(e.message || String(e)) }
    finally { setUploading(null) }
  }

  async function confirm() {
    if (!session) return
    setBusy(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('session_token', session.token)
      const r = await fetch(`${API}/api/v1/voice-bio/enroll/confirm`, { method: 'POST', headers: authHeaders(), body: fd })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`)
      setSubmitted(true)
      setSession(null)
      loadStatus()
    } catch (e: any) { setErr(e.message || String(e)) }
    finally { setBusy(false) }
  }

  const doneCount = done.filter(Boolean).length
  const needed = session?.samplesNeeded ?? 0
  const canConfirm = session && doneCount >= needed

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-wide text-purple-200" style={{ textShadow: '0 0 20px rgba(168,85,247,0.30)' }}>
          🎙 {t('vt.title')}
        </h1>
        <p className="text-sm text-slate-400 mt-1">{t('vt.sub')}</p>
      </header>

      {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">⚠ {err}</div>}
      {submitted && <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/50 px-3 py-2 text-sm text-emerald-200">{t('vt.submitted')}</div>}

      {/* Current status */}
      {!status && <div className="text-slate-400 text-sm">{t('vt.loading')}</div>}
      {status && !status.allowed && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 text-slate-300 text-sm">{status.message}</div>
      )}
      {status?.allowed && status?.enrolled && !session && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 space-y-2">
          <div className="text-emerald-300 font-semibold">{t('vt.enrolled')}</div>
          <div className="text-xs text-slate-400">
            {status.enrollment?.approved
              ? <span className="text-emerald-300">{t('vt.active')}</span>
              : <span className="text-amber-300">{t('vt.pending')}</span>}
            {' · '}{t('vt.samples')}: {status.enrollment?.samples ?? '—'}
            {' · '}{t('vt.quality')}: {status.enrollment?.quality != null ? `${Math.round((status.enrollment.quality) * 100)}%` : '—'}
          </div>
        </div>
      )}

      {/* Start */}
      {status?.allowed && !status?.enrolled && !session && (
        <button onClick={start} disabled={busy}
          className="px-5 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 disabled:opacity-50">
          {busy ? t('vt.loading') : t('vt.start')}
        </button>
      )}

      {/* Enrolment in progress */}
      {session && (
        <div className="space-y-3">
          {session.phrases.map((phrase, idx) => (
            <div key={idx} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">{t('vt.phrase_of', { n: idx + 1, m: session.phrases.length })}</div>
                {done[idx] && <span className="text-emerald-300 text-xs">{t('vt.recorded_ok')}</span>}
              </div>
              <div className="text-slate-400 text-xs mt-1">{t('vt.read_aloud')}</div>
              <div className="text-lg text-slate-100 font-semibold mt-0.5">“{phrase}”</div>
              <div className="mt-3">
                {recording === idx ? (
                  <span className="text-rose-300 text-sm animate-pulse">● {t('vt.recording')}</span>
                ) : uploading === idx ? (
                  <span className="text-sky-300 text-sm">{t('vt.uploading')}</span>
                ) : (
                  <button onClick={() => recordSample(idx)} disabled={recording !== null || uploading !== null}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border disabled:opacity-50
                      ${done[idx] ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-rose-500/20 text-rose-200 border-rose-400/40 hover:bg-rose-500/30'}`}>
                    {done[idx] ? t('vt.retry') : t('vt.record')}
                  </button>
                )}
              </div>
            </div>
          ))}

          <button onClick={confirm} disabled={!canConfirm || busy}
            className="px-5 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50">
            {busy ? t('vt.confirming') : `${t('vt.confirm')} (${doneCount}/${needed})`}
          </button>
        </div>
      )}

      <div>
        <Link href="/admin" className="text-sky-300 hover:underline text-sm">{t('vt.back')}</Link>
      </div>
    </div>
  )
}
