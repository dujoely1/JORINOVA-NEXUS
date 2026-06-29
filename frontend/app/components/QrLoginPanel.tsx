'use client'

/**
 * QrLoginPanel — desktop side of phone/QR sign-in.
 *
 * Shows a QR code; the user scans it with their phone (already signed in to the
 * web app) and approves. This panel polls the backend and, once approved,
 * stores the issued token exactly like a normal login and redirects.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { landingPathFor } from '../lib/role-routes'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function storeToken(t: string) {
  document.cookie = `access_token=${t}; path=/; max-age=604800; SameSite=Lax`
  try { localStorage.setItem('access_token', t) } catch { /* ignore */ }
}
function roleFromToken(t: string): string {
  try { return JSON.parse(atob(t.split('.')[1])).role || '' } catch { return '' }
}

export default function QrLoginPanel({ onCancel }: { onCancel: () => void }) {
  const [qr, setQr]       = useState<string | null>(null)
  const [approveUrl, setApproveUrl] = useState<string>('')
  const [err, setErr]     = useState<string>('')
  const [status, setStatus] = useState<'loading' | 'pending' | 'approved' | 'expired'>('loading')
  const sidRef  = useRef<string>('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(async () => {
    setErr(''); setStatus('loading'); setQr(null)
    try {
      const r = await fetch(`${API}/api/v1/auth/qr/start`, { method: 'POST' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      sidRef.current = d.sid
      setQr(d.qr); setApproveUrl(d.approve_url || ''); setStatus('pending')
    } catch (e: any) {
      setErr('Could not start QR sign-in'); setStatus('expired')
    }
  }, [])

  useEffect(() => { void start() }, [start])

  // Poll for approval
  useEffect(() => {
    if (status !== 'pending') return
    pollRef.current = setInterval(async () => {
      if (!sidRef.current) return
      try {
        const r = await fetch(`${API}/api/v1/auth/qr/status?sid=${encodeURIComponent(sidRef.current)}`)
        const d = await r.json()
        if (d.status === 'approved' && d.access_token) {
          setStatus('approved')
          storeToken(d.access_token)
          window.location.href = landingPathFor(roleFromToken(d.access_token))
        } else if (d.status === 'expired') {
          setStatus('expired')
        }
      } catch { /* keep polling */ }
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [status])

  return (
    <div className="text-center">
      <h3 className="text-base font-semibold text-zinc-800">Sign in with your phone</h3>
      <p className="text-xs text-zinc-500 mt-1">
        Open the app on your phone (already signed in), scan this code, and approve.
      </p>

      <div className="mt-4 flex justify-center">
        {status === 'approved' ? (
          <div className="h-44 w-44 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 text-4xl">✓</div>
        ) : qr ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={qr} alt="QR sign-in code" className="h-44 w-44 rounded-xl ring-1 ring-zinc-200" />
        ) : (
          <div className="h-44 w-44 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-400 text-sm">
            {status === 'expired' ? 'Expired' : 'Loading…'}
          </div>
        )}
      </div>

      <div className="mt-3 text-xs">
        {status === 'pending' && <span className="text-amber-600">Waiting for phone approval…</span>}
        {status === 'approved' && <span className="text-emerald-600 font-semibold">Approved — signing you in…</span>}
        {status === 'expired' && <span className="text-rose-600">Code expired.</span>}
      </div>
      {err && <div className="mt-1 text-xs text-rose-600">{err}</div>}

      <div className="mt-4 flex items-center justify-center gap-2">
        {status === 'expired' && (
          <button onClick={start} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold">New code</button>
        )}
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-600 text-sm">Use password</button>
      </div>
    </div>
  )
}
