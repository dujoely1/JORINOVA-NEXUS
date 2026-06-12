'use client'

/** Settings module — user profile + preferences + 2FA gateway. */
// trans
import { useEffect, useState } from 'react'
import Link from 'next/link'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useAuth } from '../../contexts/AuthProvider'
import { useI18n, useT } from '../../contexts/I18nProvider'
import type { Lang } from '../../lib/i18n'

const API = process.env.NEXT_PUBLIC_API_URL || ''
function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(extra?: HeadersInit): HeadersInit {
  const t = getToken(); return { ...(extra || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Settings" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const { user, refreshProfile } = useAuth()
  const t = useT()
  const { lang: ctxLang, setLang: setCtxLang } = useI18n()
  const [lang, setLang]   = useState<Lang>(ctxLang)
  const [busy, setBusy]   = useState(false)
  const [msg, setMsg]     = useState<string | null>(null)
  const [err, setErr]     = useState<string | null>(null)
  const [pwdOld, setPwdOld] = useState('')
  const [pwdNew, setPwdNew] = useState('')

  async function saveLanguage() {
    setBusy(true); setMsg(null); setErr(null)
    try {
      const r = await fetch(`${API}/api/v1/auth/me/language?language=${lang}`, {
        method: 'PATCH', headers: authHeaders(),
      })
      if (!r.ok) {
        // Fallback to PUT/me if PATCH not implemented
        const r2 = await fetch(`${API}/api/v1/auth/me`, {
          method: 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ preferred_language: lang }),
        })
        if (!r2.ok) throw new Error(`HTTP ${r2.status}`)
      }
      await refreshProfile()
      setCtxLang(lang)   // also flip the live in-app language
      setMsg(t('settings.language_saved'))
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null); setErr(null)
    try {
      const r = await fetch(`${API}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ old_password: pwdOld, new_password: pwdNew }),
      })
      if (!r.ok) throw new Error(await r.text())
      setMsg(t('settings.pw_changed'))
      setPwdOld(''); setPwdNew('')
    } catch (e: any) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(100,116,139,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(100,116,139,0.06) 100%)' }}>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-slate-200">
            ⚙️ {t('settings.title')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('settings.subtitle')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-5 space-y-4">
        {/* Profile */}
        <Card title={t('settings.profile')}>
          <Row k={t('common.username')} v={<span className="font-mono">{user?.username}</span>} />
          <Row k={t('settings.full_name')} v={user?.full_name || '—'} />
          <Row k={t('settings.email')}     v={user?.email || '—'} />
          <Row k={t('common.role')}     v={<span className="font-mono">{user?.role}</span>} />
          <Row k={t('common.dept')}     v={user?.department || '—'} />
          <Row k={t('settings.2fa')}    v={user?.has_2fa ? <span className="text-emerald-300">{t('settings.enabled')}</span> : <span className="text-slate-500">{t('settings.off')} <Link href="/admin" className="text-sky-300 hover:underline">{t('settings.configure')}</Link></span>} />
        </Card>

        {/* Language */}
        <Card title={t('settings.language')}>
          <div className="flex flex-wrap items-center gap-2">
            {(['en', 'fr', 'rw'] as const).map((code) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={`px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors
                  ${lang === code
                    ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                    : 'bg-slate-800/60 text-slate-300 border-slate-600 hover:bg-slate-800'}`}
              >
                {code === 'en' ? '🇬🇧 English' : code === 'fr' ? '🇫🇷 Français' : '🇷🇼 Kinyarwanda'}
              </button>
            ))}
            <button onClick={saveLanguage} disabled={busy} className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-sky-600 text-white font-semibold disabled:opacity-50">
              {busy ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </Card>

        {/* Password */}
        <Card title={t('settings.change_pw')}>
          <form onSubmit={changePassword} className="space-y-2">
            <input type="password" value={pwdOld} onChange={e => setPwdOld(e.target.value)} placeholder={t('settings.current_pw')} required
              className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" />
            <input type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} placeholder={t('settings.new_pw')} required minLength={8}
              className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100" />
            <div className="flex justify-end">
              <button disabled={busy || !pwdOld || pwdNew.length < 8} className="px-4 py-2 text-xs rounded-lg bg-sky-600 text-white font-semibold disabled:opacity-50">
                {t('settings.change_pw')}
              </button>
            </div>
          </form>
        </Card>

        {msg && <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/50 px-3 py-2 text-sm text-emerald-200">✓ {msg}</div>}
        {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">⚠ {err}</div>}

        <Card title={t('settings.quicklinks')}>
          <ul className="space-y-1 text-sm">
            <li><Link href="/admin"                       className="text-sky-300 hover:underline">{t('settings.ql.admin')}</Link></li>
            <li><Link href="/forgot-password"             className="text-sky-300 hover:underline">{t('settings.ql.forgot')}</Link></li>
            <li><Link href="/modules/notifications"       className="text-sky-300 hover:underline">{t('settings.ql.notif')}</Link></li>
            <li><Link href="/modules/connectivity"        className="text-sky-300 hover:underline">{t('settings.ql.conn')}</Link></li>
          </ul>
        </Card>
      </div>
    </>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 backdrop-blur p-4">
      <h3 className="text-[11px] uppercase tracking-widest font-bold text-slate-400 mb-2">{title}</h3>
      <div className="text-sm text-slate-200 space-y-1.5">{children}</div>
    </section>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-800/60 pb-1.5 last:border-0">
      <span className="text-xs text-slate-400">{k}</span>
      <span className="text-sm">{v}</span>
    </div>
  )
}
