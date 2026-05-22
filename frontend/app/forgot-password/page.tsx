'use client'

/**
 * Forgot-password flow — production wiring against the backend's two-step
 * OTP endpoints:
 *
 *   1. POST /api/v1/auth/forgot-password    { email }
 *      Always returns 200 (no user enumeration). 6-digit OTP emailed.
 *
 *   2. POST /api/v1/auth/verify-otp-reset   { email, otp, new_password }
 *      On success, the password is set and the OTP invalidated.
 *
 * Three local screens: request -> verify -> success. Email is locked once
 * the OTP request is sent so it stays in sync with what the backend hashed.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const API        = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const NEXUS_BLUE = '#0066CC'
const MIL_GREEN  = '#4B5320'

type Step = 'request' | 'verify' | 'done'

export default function ForgotPasswordPage() {
  const [step,        setStep]        = useState<Step>('request')
  const [email,       setEmail]       = useState('')
  const [otp,         setOtp]         = useState('')
  const [newPwd,      setNewPwd]      = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [info,        setInfo]        = useState('')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [cooldown,    setCooldown]    = useState(0)        // seconds until resend allowed

  const router = useRouter()

  // Resend cooldown countdown (one tick per second)
  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  // ── Stage 1: request OTP ────────────────────────────────────────────────
  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault()
    setError(''); setInfo('')
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/v1/auth/forgot-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}))
        throw new Error(detail.detail || `HTTP ${r.status}`)
      }
      const data = await r.json()
      setInfo(data.message ?? 'If that email is registered, an OTP has been sent.')
      setStep('verify')
      setCooldown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Stage 2: verify OTP + set new password ──────────────────────────────
  async function verifyOtpAndReset(e?: React.FormEvent) {
    e?.preventDefault()
    setError(''); setInfo('')

    if (otp.trim().length < 4) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    if (newPwd.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPwd !== confirmPwd) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const r = await fetch(`${API}/api/v1/auth/verify-otp-reset`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, otp: otp.trim(), new_password: newPwd }),
      })
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}))
        throw new Error(detail.detail || `HTTP ${r.status}`)
      }
      setInfo('Password reset successful. You can now sign in with your new password.')
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Check the code and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      {/* HEADER (consistent with login) */}
      <header className="text-white shadow-md"
              style={{ background: `linear-gradient(90deg, ${NEXUS_BLUE} 0%, #1E88E5 100%)` }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/login" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center font-bold text-lg shadow-sm"
                 style={{ color: NEXUS_BLUE }}>
              JN
            </div>
            <div className="leading-tight">
              <div className="font-bold tracking-wide text-sm sm:text-base">JORINOVA NEXUS</div>
              <div className="text-[10px] sm:text-xs text-blue-100 -mt-0.5">ALIS-X · Password recovery</div>
            </div>
          </Link>
        </div>
      </header>

      {/* TITLE */}
      <section className="border-b border-zinc-200 bg-gradient-to-b from-white to-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-6 text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide"
              style={{ color: MIL_GREEN }}>
            {step === 'request' && 'RESET YOUR PASSWORD'}
            {step === 'verify'  && 'VERIFY YOUR EMAIL'}
            {step === 'done'    && 'PASSWORD UPDATED'}
          </h1>
          <p className="text-sm text-zinc-600 mt-2">
            {step === 'request' && 'Enter the email registered against your account. We will send a 6-digit code.'}
            {step === 'verify'  && `A 6-digit code was sent to ${email}. The code expires in 15 minutes.`}
            {step === 'done'    && 'Your password has been changed. You can now sign in.'}
          </p>
        </div>
      </section>

      {/* FORM */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-zinc-200 p-7">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 text-sm text-blue-700">
              {info}
            </div>
          )}

          {/* ── Stage 1 ── */}
          {step === 'request' && (
            <form onSubmit={requestOtp} className="space-y-5" noValidate>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1">
                  Registered email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required autoFocus autoComplete="email"
                  placeholder="you@hospital.rw"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full rounded-lg text-white font-semibold text-sm py-2.5 transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: NEXUS_BLUE }}
              >
                {loading ? 'Sending…' : 'Send code'}
              </button>
            </form>
          )}

          {/* ── Stage 2 ── */}
          {step === 'verify' && (
            <form onSubmit={verifyOtpAndReset} className="space-y-4" noValidate>
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-zinc-700 mb-1">
                  6-digit code
                </label>
                <input
                  id="otp"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required autoFocus
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-lg font-mono tracking-widest text-center text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••"
                />
              </div>
              <div>
                <label htmlFor="newpwd" className="block text-sm font-medium text-zinc-700 mb-1">
                  New password
                </label>
                <input
                  id="newpwd"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  required autoComplete="new-password" minLength={8}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1">At least 8 characters.</p>
              </div>
              <div>
                <label htmlFor="confirmpwd" className="block text-sm font-medium text-zinc-700 mb-1">
                  Confirm new password
                </label>
                <input
                  id="confirmpwd"
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  required autoComplete="new-password" minLength={8}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < 4 || newPwd.length < 8}
                className="w-full rounded-lg text-white font-semibold text-sm py-2.5 transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: NEXUS_BLUE }}
              >
                {loading ? 'Verifying…' : 'Verify & update password'}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => { setStep('request'); setOtp(''); setNewPwd(''); setConfirmPwd('') }}
                  className="text-zinc-600 hover:underline"
                >
                  ← Use a different email
                </button>
                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={cooldown > 0 || loading}
                  className="font-medium hover:underline disabled:opacity-50 disabled:no-underline"
                  style={{ color: NEXUS_BLUE }}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* ── Stage 3 ── */}
          {step === 'done' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <button
                type="button"
                onClick={() => router.replace('/login')}
                className="w-full rounded-lg text-white font-semibold text-sm py-2.5 transition-colors shadow-sm hover:shadow-md"
                style={{ background: NEXUS_BLUE }}
              >
                Continue to sign in
              </button>
            </div>
          )}

          {step !== 'done' && (
            <p className="text-xs text-center text-zinc-500 mt-5">
              Remembered your password?{' '}
              <Link href="/login" className="hover:underline font-medium" style={{ color: NEXUS_BLUE }}>
                Sign in
              </Link>
            </p>
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="text-white"
              style={{ background: `linear-gradient(90deg, ${NEXUS_BLUE} 0%, #1565C0 100%)` }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs sm:text-sm">
          <a href="mailto:jorinovanexus@gmail.com" className="hover:underline font-medium">
            jorinovanexus@gmail.com
          </a>
          <span className="text-blue-100">Powered by JORINOVA NEXUS ALIS-X</span>
        </div>
      </footer>
    </div>
  )
}
