'use client'

/**
 * Two-factor authentication (TOTP) enrolment.
 *
 * Flow: POST /auth/2fa/setup → show QR + secret → user scans with Google
 * Authenticator / Authy → POST /auth/2fa/enable with the 6-digit code.
 * If already enabled, offers to disable (also code-verified).
 *
 * Backend: /api/v1/auth/2fa/{setup,enable,disable}
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import DeviceManager from '../../components/DeviceManager'

const API = process.env.NEXT_PUBLIC_API_URL || ''

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(json = false): HeadersInit {
  const t = getToken()
  const h: Record<string, string> = {}
  if (t) h.Authorization = `Bearer ${t}`
  if (json) h['Content-Type'] = 'application/json'
  return h
}

export default function TwoFactorPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Two-factor auth" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

interface Setup { secret: string; otpauth_uri: string; qr_data_uri: string | null }

function Inner() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [setup, setSetup]     = useState<Setup | null>(null)
  const [code, setCode]       = useState('')
  const [busy, setBusy]       = useState(false)
  const [msg, setMsg]         = useState<string | null>(null)
  const [err, setErr]         = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [mustSetup, setMustSetup]     = useState(false)

  const loadStatus = useCallback(() => {
    fetch(`${API}/api/v1/auth/me`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => { setEnabled(!!d.has_2fa); setMustSetup(!!d.must_setup_2fa) })
      .catch(e => setErr(String(e)))
  }, [])
  useEffect(loadStatus, [loadStatus])

  async function startSetup() {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const r = await fetch(`${API}/api/v1/auth/2fa/setup`, { method: 'POST', headers: authHeaders() })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`)
      setSetup(await r.json())
    } catch (e: any) { setErr(e.message || String(e)) }
    finally { setBusy(false) }
  }

  async function enable() {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const r = await fetch(`${API}/api/v1/auth/2fa/enable`, {
        method: 'POST', headers: authHeaders(true), body: JSON.stringify({ code: code.trim() }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`)
      const j = await r.json()
      setMsg('2FA is now enabled. You will be asked for a code at every login.')
      setBackupCodes(j.backup_codes || null)
      setSetup(null); setCode(''); setEnabled(true); setMustSetup(false)
    } catch (e: any) { setErr(e.message || String(e)) }
    finally { setBusy(false) }
  }

  async function regenerate() {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const r = await fetch(`${API}/api/v1/auth/2fa/backup-codes`, {
        method: 'POST', headers: authHeaders(true), body: JSON.stringify({ code: code.trim() }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`)
      const j = await r.json()
      setBackupCodes(j.backup_codes || null)
      setCode(''); setMsg('New backup codes generated — the old ones no longer work.')
    } catch (e: any) { setErr(e.message || String(e)) }
    finally { setBusy(false) }
  }

  async function disable() {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const r = await fetch(`${API}/api/v1/auth/2fa/disable`, {
        method: 'POST', headers: authHeaders(true), body: JSON.stringify({ code: code.trim() }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`)
      setMsg('2FA disabled.')
      setCode(''); setEnabled(false)
    } catch (e: any) { setErr(e.message || String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-6 space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-wide text-purple-200" style={{ textShadow: '0 0 20px rgba(168,85,247,0.30)' }}>
          🔐 Two-factor authentication
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Add a one-time code from your phone on top of your password. Strongly
          recommended for admin accounts.
        </p>
      </header>

      {mustSetup && enabled === false && (
        <div className="rounded-lg bg-amber-900/30 border border-amber-600/50 px-3 py-2 text-sm text-amber-200">
          🔒 Your role (admin) requires two-factor authentication. Please set it up
          now — you cannot use the rest of the system until you do.
        </div>
      )}

      {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">⚠ {err}</div>}
      {msg && <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/50 px-3 py-2 text-sm text-emerald-200">{msg}</div>}

      {/* Backup codes — shown ONCE after enable / regenerate */}
      {backupCodes && (
        <div className="rounded-xl border border-amber-600/50 bg-amber-950/30 p-5 space-y-3">
          <div className="text-amber-200 font-semibold">⚠ Save these backup codes now</div>
          <p className="text-xs text-amber-100/80">
            Each code works once. Use one to sign in if you lose your phone. They
            are shown only this once — store them somewhere safe (password manager).
          </p>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm text-slate-100">
            {backupCodes.map(c => (
              <div key={c} className="bg-slate-800 rounded px-2 py-1 text-center tracking-widest">{c}</div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard?.writeText(backupCodes.join('\n')); setMsg('Backup codes copied.') }}
              className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-200 text-sm hover:bg-slate-800">
              Copy codes
            </button>
            <button onClick={() => setBackupCodes(null)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">
              I’ve saved them
            </button>
          </div>
        </div>
      )}

      {enabled === null && <div className="text-slate-400 text-sm">Loading…</div>}

      {/* Already enabled → offer disable */}
      {enabled === true && !setup && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 space-y-3">
          <div className="text-emerald-300 font-semibold">✅ 2FA is enabled on this account.</div>
          <p className="text-xs text-slate-400">To turn it off, enter a current code from your authenticator app.</p>
          <input
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric" maxLength={6} placeholder="123456"
            className="w-40 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-center text-lg tracking-[0.3em] font-mono text-slate-100 outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={regenerate} disabled={busy || code.length < 6}
              className="px-5 py-2.5 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-500 disabled:opacity-50">
              Regenerate backup codes
            </button>
            <button onClick={disable} disabled={busy || code.length < 6}
              className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-500 disabled:opacity-50">
              Disable 2FA
            </button>
          </div>
          <p className="text-[11px] text-slate-500">A current authenticator code is required for either action.</p>
        </div>
      )}

      {/* Not enabled, not started → start */}
      {enabled === false && !setup && (
        <button onClick={startSetup} disabled={busy}
          className="px-5 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 disabled:opacity-50">
          {busy ? 'Loading…' : 'Set up 2FA'}
        </button>
      )}

      {/* Setup in progress → QR + confirm */}
      {setup && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 space-y-4">
          <div className="text-slate-200 text-sm font-semibold">1. Scan this with Google Authenticator / Authy</div>
          {setup.qr_data_uri
            ? <img src={setup.qr_data_uri} alt="2FA QR code" className="rounded-lg bg-white p-2 w-44 h-44" />
            : <div className="text-xs text-slate-400">QR unavailable — type the key below into your app.</div>}
          <div className="text-xs text-slate-400">
            Or enter this key manually:
            <div className="mt-1 font-mono text-slate-200 break-all bg-slate-800 rounded px-2 py-1">{setup.secret}</div>
          </div>

          <div className="text-slate-200 text-sm font-semibold pt-2">2. Enter the 6-digit code it shows</div>
          <input
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric" maxLength={6} placeholder="123456" autoFocus
            className="w-44 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-center text-lg tracking-[0.3em] font-mono text-slate-100 outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="flex gap-2">
            <button onClick={enable} disabled={busy || code.length < 6}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50">
              {busy ? 'Verifying…' : 'Enable 2FA'}
            </button>
            <button onClick={() => { setSetup(null); setCode(''); setErr(null) }}
              className="px-5 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800">
              Cancel
            </button>
          </div>
        </div>
      )}

      <DeviceManager />

      <div>
        <Link href="/modules/settings" className="text-sky-300 hover:underline text-sm">← Settings</Link>
      </div>
    </div>
  )
}
