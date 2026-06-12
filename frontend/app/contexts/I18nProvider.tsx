'use client'

/**
 * I18nProvider — drives the active language for the whole tree.
 *
 * Source of truth (in priority order):
 *   1. `user.preferred_language` from AuthProvider — DB persisted
 *   2. `localStorage['jorinova_lang']` — pre-login or anonymous pages
 *   3. browser navigator.language — fallback
 *   4. 'en' — hard default
 *
 * Setting the language:
 *   - Updates state immediately (UI changes)
 *   - Saves to localStorage
 *   - PATCHes /api/v1/auth/me (best-effort; failure does not block UI)
 *
 * Consumers use `useT()` to translate or `useI18n()` to access the raw
 * { lang, setLang } pair (e.g. for a language switcher).
 */

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react'
import { useAuth } from './AuthProvider'
import { translate, type Lang, type TKey } from '../lib/i18n'

interface I18nCtx {
  lang:    Lang
  setLang: (l: Lang) => void
  t:       (key: TKey, vars?: Record<string, string | number>) => string
}

const C = createContext<I18nCtx>({
  lang: 'en',
  setLang: () => { /* noop placeholder */ },
  t: (k) => k,
})

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const STORAGE_KEY = 'jorinova_lang'

function detectInitial(): Lang {
  if (typeof window === 'undefined') return 'en'
  // Two storage keys exist for historical reasons: 'jorinova_lang' (this
  // provider) and 'nexus.lang' (older login page). Try both so a language
  // chosen on the login screen carries through after authentication.
  for (const key of [STORAGE_KEY, 'nexus.lang']) {
    const stored = window.localStorage.getItem(key) as Lang | null
    if (stored === 'en' || stored === 'fr' || stored === 'rw') return stored
  }
  const nav = (window.navigator.language || 'en').slice(0, 2).toLowerCase()
  if (nav === 'fr') return 'fr'
  if (nav === 'rw') return 'rw'
  return 'en'
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [lang, setLangState] = useState<Lang>(() => detectInitial())

  // If the logged-in user's preferred_language differs from current, prefer it.
  useEffect(() => {
    const pref = user?.preferred_language as Lang | undefined
    if (pref && (pref === 'en' || pref === 'fr' || pref === 'rw') && pref !== lang) {
      setLangState(pref)
      try { window.localStorage.setItem(STORAGE_KEY, pref) } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.preferred_language])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      // Write both keys so the login page's older code keeps working too.
      window.localStorage.setItem(STORAGE_KEY, l)
      window.localStorage.setItem('nexus.lang', l)
    } catch { /* noop */ }
    // Also flip <html lang="…"> so screen-readers / a11y get the right hint
    try { document.documentElement.lang = l } catch { /* noop */ }
    // Best-effort persist to backend. Don't await, don't surface errors —
    // the local switch is the source of truth for the user's session.
    const tok = getToken()
    if (tok) {
      fetch(`${API}/api/v1/auth/me/language?language=${l}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tok}` },
      }).catch(() => { /* ignore; will retry next change */ })
    }
  }, [])

  // Sync <html lang> initially
  useEffect(() => {
    try { document.documentElement.lang = lang } catch { /* noop */ }
  }, [lang])

  // ── Tag every API request with the active language ──────────────────────
  // The backend localizes HTTP error `detail` strings off `Accept-Language` /
  // `X-Lang`. Components fetch all over the app (mostly with raw fetch), so we
  // wrap window.fetch once here instead of editing every call site. Only API
  // requests are touched; everything else passes through untouched.
  const langRef = useRef<Lang>(lang)
  useEffect(() => { langRef.current = lang }, [lang])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as { __nexusFetchPatched?: boolean; __nexusOrigFetch?: typeof fetch }
    if (w.__nexusFetchPatched) return
    const orig = window.fetch.bind(window)
    w.__nexusOrigFetch = orig
    w.__nexusFetchPatched = true
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = typeof input === 'string' ? input
                  : input instanceof URL ? input.href
                  : (input as Request).url
        if (url && url.includes('/api/')) {
          const headers = new Headers(
            init?.headers ?? (input instanceof Request ? input.headers : undefined),
          )
          headers.set('X-Lang', langRef.current)
          if (!headers.has('Accept-Language')) headers.set('Accept-Language', langRef.current)
          init = { ...(init ?? {}), headers }
        }
      } catch { /* fall through to original fetch */ }
      return orig(input as RequestInfo | URL, init)
    }
    return () => {
      if (w.__nexusOrigFetch) {
        window.fetch = w.__nexusOrigFetch
        w.__nexusFetchPatched = false
      }
    }
  }, [])

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  )

  return <C.Provider value={{ lang, setLang, t }}>{children}</C.Provider>
}

export function useI18n(): I18nCtx {
  return useContext(C)
}

/** Convenience hook — just the t() function. */
export function useT() {
  return useContext(C).t
}
