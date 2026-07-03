'use client'

/**
 * DeviceManager — the "My devices" panel of the revocable trusted-device
 * registry. Lists the phones/browsers that have completed a full login for this
 * account and lets the user (or an admin) REVOKE one, so that device's session
 * is rejected on its next request and it must sign in again.
 *
 *   GET    /api/v1/auth/devices
 *   POST   /api/v1/auth/devices/{id}/revoke
 *   DELETE /api/v1/auth/devices/{id}
 */

import { useCallback, useEffect, useState } from 'react'
import { getDeviceId } from '../lib/api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function headers(): HeadersInit {
  const tok = getToken()
  return {
    'Content-Type': 'application/json',
    'X-Device-Id': getDeviceId(),
    ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
  }
}

interface Device {
  id: number
  device_name: string
  user_agent: string | null
  ip_address: string | null
  revoked: boolean
  last_seen_at: string | null
  current: boolean
}

export default function DeviceManager() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState<number | null>(null)
  const [err, setErr]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch(`${API}/api/v1/auth/devices`, { headers: headers() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setDevices(await r.json())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load devices')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function act(id: number, kind: 'revoke' | 'delete') {
    setBusy(id); setErr(null)
    try {
      const r = await fetch(
        `${API}/api/v1/auth/devices/${id}${kind === 'revoke' ? '/revoke' : ''}`,
        { method: kind === 'revoke' ? 'POST' : 'DELETE', headers: headers() },
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed')
    } finally { setBusy(null) }
  }

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-purple-200">📱 My devices</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Phones and browsers signed in to this account. Revoke one to force it to sign in again.
          </p>
        </div>
        <button onClick={load} className="text-xs text-sky-300 hover:underline">Refresh</button>
      </div>

      {loading && <div className="text-slate-400 text-sm">Loading…</div>}
      {err && <div className="text-rose-300 text-xs">{err}</div>}
      {!loading && devices.length === 0 && (
        <div className="text-slate-400 text-xs">No devices recorded yet — this list fills as you sign in.</div>
      )}

      <ul className="space-y-2">
        {devices.map(d => (
          <li key={d.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm text-slate-100 font-semibold flex items-center gap-2">
                {d.device_name}
                {d.current && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/40">this device</span>
                )}
                {d.revoked && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-200 border border-rose-400/40">revoked</span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {d.ip_address ?? '—'} · last seen {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!d.revoked && !d.current && (
                <button onClick={() => act(d.id, 'revoke')} disabled={busy === d.id}
                  className="text-xs px-2.5 py-1 rounded-lg border border-amber-400/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/30 disabled:opacity-50">
                  {busy === d.id ? '…' : 'Revoke'}
                </button>
              )}
              <button onClick={() => act(d.id, 'delete')} disabled={busy === d.id}
                className="text-xs px-2.5 py-1 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/60 disabled:opacity-50">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
