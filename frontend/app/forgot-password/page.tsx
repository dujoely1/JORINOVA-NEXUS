'use client'

/**
 * Forgot-password — 4-screen production flow.
 *
 *   1. request   → user types email           → POST /auth/forgot-password
 *                                                (dev: response includes
 *                                                 dev_otp so you can copy it
 *                                                 without SMTP setup)
 *   2. verify    → user types ONLY the 6-digit code → POST /auth/verify-otp
 *                                                returns a short-lived
 *                                                reset_token (single-use)
 *   3. password  → user picks + confirms new password → POST /auth/reset-password
 *                                                consumes the reset_token
 *   4. done      → success, go to /login
 *
 * The OTP is consumed in step 2; if the user closes the tab between 2 and 3
 * they restart at step 1. This matches industry-standard reset flows
 * (Stripe, GitHub, etc.).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '../components/Logo'
import { useT } from '../contexts/I18nProvider'

const API        = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const NEXUS_BLUE = '#0066CC'
const NEXUS_BLUE_LT = '#E6F0FA'
const MIL_GREEN  = '#4B5320'
const GOLD       = '#D4A017'
const GOLD_DK    = '#A6800F'

type Step = 'request' | 'verify' | 'password' | 'done'

export default function ForgotPasswordPage() {
  const t = useT()
  const [step,         setStep]         = useState<Step>('request')
  const [email,        setEmail]        = useState('')
  const [otp,          setOtp]          = useState('')
  const [resetToken,   setResetToken]   = useState<string | null>(null)
  const [newPwd,       setNewPwd]       = useState('')
  const [confirmPwd,   setConfirmPwd]   = useState('')
  const [showPwd,      setShowPwd]      = useState(false)
  const [info,         setInfo]         = useState('')
  const [error,        setError]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [cooldown,     setCooldown]     = useState(0)

  const router = useRouter()

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  // Magic-link landing: the "Yes, it's me" email link redirects here with a
  // ?reset_token=… (identity already confirmed from the user's own email/device)
  // — jump straight to the set-new-password step. ?error=expired shows a notice.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const rt = sp.get('reset_token')
    if (rt) {
      setResetToken(rt)
      setStep('password')
      setInfo(t('fp.msg.verified'))
    } else if (sp.get('error') === 'expired') {
      setError(t('fp.err.session'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Stage 1: request OTP ────────────────────────────────────────────────
  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault()
    setError(''); setInfo('')
    if (!email || !email.includes('@')) {
      setError(t('fp.err.email'))
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
      setInfo(data.message ?? t('fp.msg.sent'))
      setStep('verify')
      setCooldown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fp.err.send'))
    } finally {
      setLoading(false)
    }
  }

  // ── Stage 2: verify OTP alone — no password yet ─────────────────────────
  async function verifyOtp(e?: React.FormEvent) {
    e?.preventDefault()
    setError(''); setInfo('')
    if (otp.trim().length !== 6) {
      setError(t('fp.err.otp_len'))
      return
    }
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/v1/auth/verify-otp`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, otp: otp.trim() }),
      })
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}))
        throw new Error(detail.detail || `HTTP ${r.status}`)
      }
      const data = await r.json()
      setResetToken(data.reset_token)
      setInfo(t('fp.msg.verified'))
      setStep('password')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fp.err.verify'))
    } finally {
      setLoading(false)
    }
  }

  // ── Stage 3: set new password ──────────────────────────────────────────
  async function setNewPassword(e?: React.FormEvent) {
    e?.preventDefault()
    setError(''); setInfo('')

    if (!resetToken) {
      setError(t('fp.err.session'))
      setStep('request'); return
    }
    if (newPwd.length < 8) {
      setError(t('fp.err.pw_short'))
      return
    }
    if (newPwd !== confirmPwd) {
      setError(t('fp.err.pw_match'))
      return
    }
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/v1/auth/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          reset_token: resetToken,
          new_password: newPwd,
          confirm_password: confirmPwd,
        }),
      })
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}))
        throw new Error(detail.detail || `HTTP ${r.status}`)
      }
      setInfo(t('fp.msg.updated'))
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fp.err.update'))
    } finally {
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: `linear-gradient(180deg, ${NEXUS_BLUE_LT} 0%, #FFFFFF 50%, ${NEXUS_BLUE_LT} 100%)` }}
    >
      {/* HEADER */}
      <header className="text-white shadow-md"
              style={{ background: `linear-gradient(90deg, ${NEXUS_BLUE} 0%, #1E88E5 100%)` }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex items-center gap-3">
          <Link href="/login" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <Logo size={40} className="ring-1 ring-white/40" />
            <div className="leading-tight">
              <div className="font-bold tracking-wide text-sm sm:text-base">JORINOVA NEXUS</div>
              <div className="text-[10px] sm:text-xs text-blue-100 -mt-0.5">ALIS-X · {t('fp.subtitle')}</div>
            </div>
          </Link>
        </div>
      </header>

      {/* TITLE */}
      <section className="border-b" style={{ borderColor: `${NEXUS_BLUE}30`, background: 'rgba(255,255,255,0.55)' }}>
        <div className="mx-auto max-w-3xl px-4 py-6 text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide" style={{ color: MIL_GREEN }}>
            {step === 'request'  && t('fp.title.request')}
            {step === 'verify'   && t('fp.title.verify')}
            {step === 'password' && t('fp.title.password')}
            {step === 'done'     && t('fp.title.done')}
          </h1>
          <p className="text-sm font-semibold italic" style={{ color: GOLD_DK, textShadow: `0 0 12px ${GOLD}33` }}>
            {t('dash.tagline')}
          </p>
          {/* Progress dots */}
          <ProgressDots step={step} />
        </div>
      </section>

      {/* FORM */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-7"
             style={{ border: `2px solid ${NEXUS_BLUE}`, boxShadow: `0 12px 40px ${NEXUS_BLUE}33` }}>

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
          {/* ── STAGE 1 — request OTP ── */}
          {step === 'request' && (
            <form onSubmit={requestOtp} className="space-y-5" noValidate>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1">
                  {t('fp.email_label')}
                </label>
                <input
                  id="email" type="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  required autoFocus autoComplete="email"
                  placeholder="you@hospital.rw"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button type="submit" disabled={loading || !email}
                      className="w-full rounded-lg text-white font-semibold text-sm py-2.5 transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: NEXUS_BLUE }}>
                {loading ? t('fp.sending') : t('fp.send_code')}
              </button>
            </form>
          )}

          {/* ── STAGE 2 — OTP only ── */}
          {step === 'verify' && (
            <form onSubmit={verifyOtp} className="space-y-5" noValidate>
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-zinc-700 mb-1">
                  {t('fp.code_sent_to')} <span className="font-mono">{email}</span>
                </label>
                <input
                  id="otp"
                  inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required autoFocus
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-2xl font-mono tracking-[0.5em] text-center text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••"
                />
                <p className="text-xs text-zinc-500 mt-1.5 text-center">
                  {t('fp.expires')}
                </p>
              </div>
              <button type="submit" disabled={loading || otp.length !== 6}
                      className="w-full rounded-lg text-white font-semibold text-sm py-2.5 transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: NEXUS_BLUE }}>
                {loading ? t('fp.verifying') : t('fp.verify_code')}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button type="button"
                        onClick={() => { setStep('request'); setOtp('') }}
                        className="text-zinc-600 hover:underline">
                  {t('fp.diff_email')}
                </button>
                <button type="button" onClick={requestOtp}
                        disabled={cooldown > 0 || loading}
                        className="font-medium hover:underline disabled:opacity-50 disabled:no-underline"
                        style={{ color: NEXUS_BLUE }}>
                  {cooldown > 0 ? t('fp.resend_in', { n: cooldown }) : t('fp.resend')}
                </button>
              </div>
            </form>
          )}

          {/* ── STAGE 3 — new password ── */}
          {step === 'password' && (
            <form onSubmit={setNewPassword} className="space-y-4" noValidate>
              <div>
                <label htmlFor="newpwd" className="block text-sm font-medium text-zinc-700 mb-1">
                  {t('fp.new_pw')}
                </label>
                <div className="relative">
                  <input
                    id="newpwd"
                    type={showPwd ? 'text' : 'password'}
                    value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                    required autoFocus autoComplete="new-password" minLength={8}
                    className="w-full rounded-lg border border-zinc-300 bg-white pl-3 pr-10 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="button"
                          onClick={() => setShowPwd(s => !s)}
                          aria-label={showPwd ? t('fp.hide_pw') : t('fp.show_pw')}
                          className="absolute inset-y-0 right-2 px-1.5 text-xs text-zinc-500 hover:text-zinc-800">
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">{t('fp.min8')}</p>
              </div>
              <div>
                <label htmlFor="confirmpwd" className="block text-sm font-medium text-zinc-700 mb-1">
                  {t('fp.confirm_pw')}
                </label>
                <input
                  id="confirmpwd"
                  type={showPwd ? 'text' : 'password'}
                  value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
                  required autoComplete="new-password" minLength={8}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button type="submit" disabled={loading || newPwd.length < 8 || newPwd !== confirmPwd}
                      className="w-full rounded-lg text-white font-semibold text-sm py-2.5 transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: NEXUS_BLUE }}>
                {loading ? t('fp.updating') : t('fp.update_pw')}
              </button>
            </form>
          )}

          {/* ── STAGE 4 — done ── */}
          {step === 'done' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <button type="button" onClick={() => router.replace('/login')}
                      className="w-full rounded-lg text-white font-semibold text-sm py-2.5 transition-colors shadow-sm hover:shadow-md"
                      style={{ background: NEXUS_BLUE }}>
                {t('fp.continue')}
              </button>
            </div>
          )}

          {step !== 'done' && (
            <p className="text-xs text-center text-zinc-500 mt-5">
              {t('fp.remembered')}{' '}
              <Link href="/login" className="hover:underline font-medium" style={{ color: NEXUS_BLUE }}>
                {t('fp.signin')}
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
          <span className="text-blue-100">{t('fp.powered')}</span>
        </div>
      </footer>
    </div>
  )
}


// ── Small bits ──────────────────────────────────────────────────────────────

function ProgressDots({ step }: { step: Step }) {
  const stepIdx = { request: 0, verify: 1, password: 2, done: 3 }[step]
  return (
    <div className="flex items-center justify-center gap-2 pt-1" aria-label="Progress">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-1.5 rounded-full transition-all"
          style={{
            width: i === stepIdx ? 28 : 12,
            background: i <= stepIdx ? NEXUS_BLUE : '#CBD5E1',
          }}
        />
      ))}
    </div>
  )
}
