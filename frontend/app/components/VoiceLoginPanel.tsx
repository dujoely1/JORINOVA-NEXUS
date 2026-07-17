'use client'

/**
 * VoiceLoginPanel — hands-free (touchless) sign-in.
 * Records ~4s, uploads 16 kHz mono WAV to POST /voice-bio/login (1:N speaker
 * match), stores the returned token (10-year, "stay signed in"), and hands the
 * role back so the login page can route the user to their landing page.
 */
import { useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// 10-year cookie + localStorage — matches lib/api.ts (stay signed in forever).
function storeToken(t: string) {
  document.cookie = `access_token=${t}; path=/; max-age=315360000; SameSite=Lax`
  try { localStorage.setItem('access_token', t) } catch { /* ignore */ }
}

function encodeWav(samples: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE')
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, samples.length * 2, true)
  let o = 44
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2 }
  return new Blob([buf], { type: 'audio/wav' })
}

async function blobToWav(blob: Blob, targetSr = 16000): Promise<Blob> {
  const AC = (window.AudioContext || (window as any).webkitAudioContext)
  const ac = new AC()
  try {
    const d = await ac.decodeAudioData(await blob.arrayBuffer())
    const { numberOfChannels: ch, length: len, sampleRate: srcSr } = d
    const mono = new Float32Array(len)
    for (let c = 0; c < ch; c++) { const g = d.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += g[i] / ch }
    const outLen = Math.max(1, Math.round(len * targetSr / srcSr))
    const out = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) { const tt = i * srcSr / targetSr, i0 = Math.floor(tt), i1 = Math.min(i0 + 1, len - 1); out[i] = mono[i0] + (mono[i1] - mono[i0]) * (tt - i0) }
    return encodeWav(out, targetSr)
  } finally { try { await ac.close() } catch { /* noop */ } }
}

const L: Record<string, { title: string; hint: string; speak: string; listening: string; checking: string; start: string; again: string; cancel: string }> = {
  en: { title: 'Sign in with your voice', hint: 'Tap, then say: “Hello Nexus, this is <your name>”', speak: '🔴 Speak now…', listening: 'Listening ~4s', checking: 'Identifying you…', start: '🎙 Start', again: 'Try again', cancel: 'Cancel' },
  fr: { title: 'Se connecter par la voix', hint: 'Touchez, puis dites : « Hello Nexus, ici <votre nom> »', speak: '🔴 Parlez…', listening: 'Écoute ~4s', checking: 'Identification…', start: '🎙 Démarrer', again: 'Réessayer', cancel: 'Annuler' },
  rw: { title: 'Injira ukoresheje ijwi', hint: 'Kanda, hanyuma uvuge: «Hello Nexus, ndi <izina ryawe>»', speak: '🔴 Vuga…', listening: 'Ndumva ~4s', checking: 'Ndagusanga…', start: '🎙 Tangira', again: 'Ongera ugerageze', cancel: 'Reka' },
}

export default function VoiceLoginPanel({ lang = 'en', onDone, onCancel }: { lang?: string; onDone: (role: string, username: string) => void; onCancel: () => void }) {
  const t = L[lang] ?? L.en
  const [state, setState] = useState<'idle' | 'recording' | 'checking' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  async function start() {
    setMsg(''); setState('recording')
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch { setState('error'); setMsg('Microphone permission denied'); return }
    const chunks: BlobPart[] = []
    const rec = new MediaRecorder(stream)
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise<void>(r => { rec.onstop = () => r() })
    rec.start()
    await new Promise(r => setTimeout(r, 4000))
    try { rec.stop() } catch { /* noop */ }
    await stopped
    stream.getTracks().forEach(tk => tk.stop())

    setState('checking')
    try {
      const wav = await blobToWav(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), 16000)
      const fd = new FormData(); fd.append('audio', wav, 'login.wav')
      const r = await fetch(`${API}/api/v1/voice-bio/login`, { method: 'POST', body: fd })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || `HTTP ${r.status}`) }
      const j = await r.json()
      storeToken(j.access_token)
      onDone(j.role, j.username)
    } catch (e: any) { setState('error'); setMsg(e.message || 'Voice not recognised') }
  }

  return (
    <div className="space-y-4 text-center">
      <div className="text-lg font-bold text-zinc-900">🎙 {t.title}</div>
      <p className="text-xs text-zinc-500">{t.hint}</p>

      <div className="flex flex-col items-center gap-2 py-2">
        {state === 'recording' && <div className="text-rose-600 font-semibold animate-pulse">{t.speak}</div>}
        {state === 'recording' && <div className="text-[11px] text-zinc-400">{t.listening}</div>}
        {state === 'checking' && <div className="text-sky-600 font-semibold">{t.checking}</div>}
        {state === 'error' && <div className="text-sm text-red-600">⚠ {msg}</div>}
      </div>

      <div className="flex gap-2 justify-center">
        {(state === 'idle' || state === 'error') && (
          <button onClick={start} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            {state === 'error' ? t.again : t.start}
          </button>
        )}
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-600 hover:bg-zinc-50">
          {t.cancel}
        </button>
      </div>
    </div>
  )
}
