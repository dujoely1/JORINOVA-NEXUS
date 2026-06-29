'use client'

/**
 * /qr-approve — phone side of QR sign-in.
 *
 * Opened by scanning the desktop QR. Requires the phone to be signed in already
 * (possession + session factor). The native app can gate this behind Fingerprint
 * / Face ID before calling approve; on the web we use the existing session.
 */

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Logo from '../components/Logo'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const NEXUS_BLUE = '#0066CC'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}

function Inner() {
  const sid = useSearchParams().get('sid') || ''
  const [done, setDone] = useState(false)
  const [err, setErr]   = useState('')
  const [busy, setBusy] = useState(false)
  const token = getToken()

  async function approve() {
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API}/api/v1/auth/qr/approve?sid=${encodeURIComponent(sid)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setDone(true)
    } catch (e: any) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
         style={{ background: 'linear-gradient(180deg,#E6F0FA,#fff)' }}>
      <Logo size={56} />
      <h1 className="mt-4 text-xl font-bold text-zinc-900">Approve desktop sign-in</h1>

      {!sid ? (
        <p className="mt-3 text-sm text-rose-600">Invalid or missing code. Re-scan the QR on your computer.</p>
      ) : !token ? (
        <>
          <p className="mt-3 text-sm text-zinc-600">Please sign in on this phone first, then re-scan the QR.</p>
          <Link href="/login" className="mt-4 px-5 py-2.5 rounded-lg text-white font-semibold" style={{ background: NEXUS_BLUE }}>Sign in</Link>
        </>
      ) : done ? (
        <>
          <div className="mt-5 h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl">✓</div>
          <p className="mt-3 text-sm text-emerald-700 font-semibold">Approved! Your computer is now signing in.</p>
          <p className="text-xs text-zinc-500 mt-1">You can close this page.</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-zinc-600 max-w-xs">
            Confirm that <strong>you</strong> are signing in on a computer. Only approve if you started this.
          </p>
          {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
          <button onClick={approve} disabled={busy}
                  className="mt-5 px-6 py-3 rounded-lg text-white font-semibold shadow-sm disabled:opacity-50"
                  style={{ background: NEXUS_BLUE }}>
            {busy ? 'Approving…' : '✓ Approve sign-in'}
          </button>
          <p className="mt-3 text-[11px] text-zinc-400 max-w-xs">
            Tip: the mobile app can require Fingerprint / Face ID before this step.
          </p>
        </>
      )}
    </div>
  )
}

export default function QrApprovePage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-500">Loading…</div>}><Inner /></Suspense>
}
