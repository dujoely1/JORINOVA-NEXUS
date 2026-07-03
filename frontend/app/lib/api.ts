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

/** Stable per-browser/-phone id for the revocable trusted-device registry.
 *  Generated once and kept in localStorage; sent as the X-Device-Id header so
 *  the backend can bind the session to this device and let it be revoked. */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('device_id')
  if (!id) {
    id = (crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    localStorage.setItem('device_id', id)
  }
  return id
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
      'X-Device-Id': getDeviceId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.detail ?? res.statusText) as Error & { status?: number }
    err.status = res.status                 // let callers distinguish 401 from 5xx/network
    throw err
  }
  return res.json()
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Thrown when the account has 2FA on and a (valid) TOTP code is still needed. */
export class TwoFactorRequiredError extends Error {
  constructor(msg = '2FA code required') { super(msg); this.name = 'TwoFactorRequiredError' }
}

export async function login(
  username: string, password: string, otp?: string,
): Promise<TokenOut> {
  const fields: Record<string, string> = { username, password, grant_type: 'password' }
  if (otp) fields.otp = otp
  const body = new URLSearchParams(fields)
  const res = await fetch(`${API}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Device-Id': getDeviceId() },
    body,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const detail = data.detail ?? res.statusText
    // 401 with a 2FA-specific detail → ask the user for the code instead of
    // showing a generic "invalid credentials" error.
    if (res.status === 401 && typeof detail === 'string' &&
        detail.toLowerCase().includes('2fa')) {
      throw new TwoFactorRequiredError(detail)
    }
    throw new Error(detail)
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
