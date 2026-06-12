/** ALIS-X — typed API helpers + TanStack Query hooks */
'use client'

import type { User, TokenOut } from '@/types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie
    .split('; ')
    .find((r) => r.startsWith('access_token='))
    ?.split('=')[1] ?? localStorage.getItem('access_token')
}

function setToken(t: string) {
  // Persistent session cookie (7 days) + localStorage fallback so the operator
  // is not forced to re-login during a shift / demo.
  try {
    document.cookie = `access_token=${t}; path=/; max-age=604800; SameSite=Lax`
  } catch {
    /* IE<11 fallback — no-op */
  }
  localStorage.setItem('access_token', t)
}

function clearToken() {
  document.cookie = 'access_token=; path=/; max-age=0; SameSite=Lax'
  localStorage.removeItem('access_token')
}

/** Low-level — already adds the Authorization header. */
async function request<T>(
  path: string, opts: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? res.statusText)
  }
  return res.json()
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(
  username: string, password: string,
): Promise<TokenOut> {
  const body = new URLSearchParams({ username, password, grant_type: 'password' })
  const res = await fetch(`${API}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail ?? res.statusText)
  }
  const data = await res.json()
  setToken(data.access_token)
  return data
}

export async function me(): Promise<User> {
  return request<User>('/api/v1/auth/me')
}

export async function logout() {
  clearToken()
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function health() {
  return request<{ status: string; app: string; version: string }>(
    '/api/v1/health',
  )
}
