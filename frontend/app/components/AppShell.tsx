'use client'

/**
 * AppShell — the single header + sidebar + footer chrome shared by every
 * authenticated page in the system.
 *
 * Adds three production-grade behaviours:
 *
 *   1. Persistent sidebar with role-filtered navigation
 *   2. Idle-timeout auto-logout (default 5 minutes). Resets on any user
 *      activity (mouse, key, touch, scroll). On expiry, calls logout()
 *      and pushes to /login?reason=idle so the login page can show the
 *      'Signed out for inactivity' banner.
 *   3. Mobile-friendly: sidebar hides under a hamburger on small screens.
 */

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../contexts/AuthProvider'
import { useI18n, useT } from '../contexts/I18nProvider'
import { LANGUAGES, type Lang } from '../lib/i18n'
import Logo from './Logo'
import Avatar from './Avatar'
import ProfilePhotoEditor from './ProfilePhotoEditor'
import Sidebar from './Sidebar'
import ModuleToolbar from './ModuleToolbar'

const NEXUS_BLUE    = '#0066CC'
const NEXUS_BLUE_LT = '#E6F0FA'
const NEO_TOP       = '#0A1628'
const NEO_MID       = '#020817'
const NEO_BOTTOM    = '#000814'

// Idle auto-logout window. Pilot: keep the session alive for a full shift so
// the operator is never bumped back to the login screen mid-demo. Set
// NEXT_PUBLIC_IDLE_MINUTES to a small number to re-enable a short timeout, or
// 0 to disable idle logout entirely.
const _IDLE_MIN = Number(process.env.NEXT_PUBLIC_IDLE_MINUTES ?? '720')   // default 12 h
const IDLE_MS = _IDLE_MIN > 0 ? _IDLE_MIN * 60 * 1000 : 0

export default function AppShell({
  children,
  pageTag,
  theme = 'light',
  /** Hide the sidebar (e.g. on the training-runner full-screen view). */
  showSidebar = true,
}: {
  children:      ReactNode
  pageTag?:      string
  theme?:        'light' | 'dark'
  showSidebar?:  boolean
}) {
  const { user, logout, refreshProfile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { lang, setLang } = useI18n()
  const t = useT()

  // Mandatory 2FA: a super_admin without 2FA is forced onto the enrolment page
  // and cannot use any other screen until it is set up.
  useEffect(() => {
    if (user?.must_setup_2fa && pathname !== '/security/two-factor') {
      router.replace('/security/two-factor')
    }
  }, [user, pathname, router])

  const [now,    setNow]    = useState<Date | null>(null)
  const [online, setOnline] = useState<boolean>(true)
  const [navOpen, setNavOpen] = useState<boolean>(false)
  const [langOpen, setLangOpen] = useState<boolean>(false)
  const [photoOpen, setPhotoOpen] = useState<boolean>(false)

  // ── Live clock + online status (SSR-safe) ─────────────────────────────
  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    setOnline(navigator.onLine)
    const up   = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online',  up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online',  up)
      window.removeEventListener('offline', down)
    }
  }, [])

  // ── Idle timeout ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return                                // never log out a non-logged-in user
    if (IDLE_MS <= 0) return                          // idle logout disabled (persistent session)
    let timer: number
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        logout()
        router.push('/login?reason=idle')
      }, IDLE_MS)
    }
    const events: (keyof WindowEventMap)[] = [
      'mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click',
    ]
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      window.clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [user, logout, router])

  const dateStr = now ? now.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB',
                       { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const timeStr = now ? now.toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB',
                       { hour: '2-digit', minute: '2-digit' }) : '--:--'

  const dark = theme === 'dark'
  const bodyBg = dark
    ? `radial-gradient(ellipse at top, ${NEO_TOP} 0%, ${NEO_MID} 55%, ${NEO_BOTTOM} 100%)`
    : `linear-gradient(180deg, ${NEXUS_BLUE_LT} 0%, #FFFFFF 50%, ${NEXUS_BLUE_LT} 100%)`

  return (
    <div
      className={`min-h-screen flex flex-col ${dark ? 'text-slate-100' : ''}`}
      style={{ background: bodyBg }}
    >
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header
        className="text-white shadow-md sticky top-0 z-20"
        style={{ background: `linear-gradient(90deg, ${NEXUS_BLUE} 0%, #1E88E5 100%)` }}
      >
        <div className="mx-auto max-w-[1600px] px-3 sm:px-5 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {showSidebar && (
              <button
                onClick={() => setNavOpen(o => !o)}
                className="md:hidden p-1.5 rounded-md hover:bg-white/15"
                aria-label="Toggle navigation"
              >
                ☰
              </button>
            )}
            <Link href="/dashboard" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
              <Logo size={40} className="ring-1 ring-white/40" />
              <div className="leading-tight">
                <div className="font-bold tracking-wide text-sm sm:text-base">JORINOVA NEXUS</div>
                <div className="text-[10px] sm:text-xs text-blue-100 -mt-0.5">
                  ALIS-X{pageTag ? ` · ${pageTag}` : ` · ${t('shell.tagline')}`}
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm">
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="font-mono">{timeStr}</span>
              <span className="text-blue-100 text-[11px]">{dateStr}</span>
            </div>
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                online
                  ? 'bg-emerald-500/20 text-emerald-50 border border-emerald-300/40'
                  : 'bg-rose-500/20 text-rose-50 border border-rose-300/40'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-300 animate-pulse' : 'bg-rose-300'}`} />
              {online ? t('shell.online') : t('shell.offline')}
            </span>

            {/* ── Language switcher ─────────────────────────────────── */}
            <div className="relative">
              <button
                onClick={() => setLangOpen(o => !o)}
                onBlur={() => setTimeout(() => setLangOpen(false), 150)}
                title={t('shell.language')}
                className="text-xs px-2 py-1.5 rounded-md bg-white/10 hover:bg-white/25 border border-white/30 transition-colors flex items-center gap-1"
              >
                <span>{LANGUAGES[lang].flag}</span>
                <span className="font-bold uppercase tracking-wider">{lang}</span>
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full mt-1 min-w-[140px] rounded-lg border border-slate-300/40 bg-white text-zinc-800 shadow-xl z-50 overflow-hidden">
                  {(Object.entries(LANGUAGES) as [Lang, typeof LANGUAGES['en']][]).map(([code, info]) => (
                    <button
                      key={code}
                      onMouseDown={(e) => { e.preventDefault(); setLang(code); setLangOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2
                        ${lang === code ? 'bg-blue-50 font-bold text-blue-700' : ''}`}
                    >
                      <span className="text-base">{info.flag}</span>
                      <span>{info.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {user && (
              <>
                <div className="hidden sm:block text-right leading-tight">
                  <div className="text-xs font-semibold">{user.full_name || user.username}</div>
                  <div className="text-[10px] text-blue-100">
                    {(user.role || '').replace(/_/g, ' ')}
                    {user.department ? ` · ${user.department}` : ''}
                  </div>
                </div>
                <button onClick={() => setPhotoOpen(true)} title="Profile photo" className="rounded-full hover:ring-2 hover:ring-white/60 transition">
                  <Avatar src={user.photo_url} name={user.full_name || user.username} role={user.role} size={34} />
                </button>
                <button
                  onClick={() => { logout(); router.push('/login') }}
                  title={t('shell.sign_out')}
                  className="text-xs px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/25 border border-white/30 transition-colors"
                >
                  ⎋
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── BODY: sidebar + content ─────────────────────────────────────── */}
      <div className="flex-1 flex">
        {showSidebar && (
          <>
            <Sidebar
              role={user?.role}
              open={navOpen}
              onItemClick={() => setNavOpen(false)}
              theme={theme}
            />
            {navOpen && (
              <div
                className="md:hidden fixed inset-0 z-20 bg-black/40"
                onClick={() => setNavOpen(false)}
              />
            )}
          </>
        )}
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* ── FLOATING MODULE TOOLBAR (mic + image AI + label) ───────────── */}
      {user && <ModuleToolbar />}

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer
        className="text-white"
        style={{ background: `linear-gradient(90deg, ${NEXUS_BLUE} 0%, #1565C0 100%)` }}
      >
        <div className="mx-auto max-w-[1600px] px-3 sm:px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs sm:text-sm">
          <a href="mailto:jorinovanexus@gmail.com" className="hover:underline font-medium">
            jorinovanexus@gmail.com
          </a>
          <span className="text-blue-100">Powered by JORINOVA NEXUS ALIS-X · {t('shell.idle_logout')}</span>
        </div>
      </footer>

      {photoOpen && user && (
        <ProfilePhotoEditor
          uid={user.id}
          currentPhoto={user.photo_url}
          name={user.full_name || user.username}
          onClose={() => setPhotoOpen(false)}
          onChanged={() => { void refreshProfile() }}
        />
      )}
    </div>
  )
}
