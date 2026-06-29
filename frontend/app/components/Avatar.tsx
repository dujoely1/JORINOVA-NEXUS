'use client'

/**
 * Avatar — renders user.photo_url with a professional default fallback.
 *
 * Fallback = coloured initials bubble. When a `role` is supplied the colour and
 * a small role badge come from the role (Administrator → red, Pathologist →
 * purple, Lab Technician → blue, Reception → green, Manager → orange, …). With
 * no role it falls back to a deterministic per-name hue (legacy behaviour, so
 * existing call sites are unchanged). A dead/404 photo URL also falls through to
 * the bubble, so the layout never breaks.
 *
 * Use:
 *   <Avatar src={user.photo_url} name={user.full_name} role={user.role} size={36} />
 */

import { useEffect, useState } from 'react'

const NEXUS_BLUE = '#0066CC'

type Props = {
  /** URL or absolute path of the photo. Pass `null` to skip the <img>. */
  src?:        string | null
  /** Used both for the initials fallback and the alt text. */
  name:        string
  /** Optional role — drives the default-avatar colour + badge. */
  role?:       string | null
  /** Pixels. Square. */
  size?:       number
  className?:  string
  /** Show the green online dot in the corner. Default true. */
  showStatus?: boolean
  /** Show the small role badge on the default avatar. Default true when role given. */
  showBadge?:  boolean
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic colour from a string — same name always gets the same hue.
function hueFor(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

// Role → accent colour (two-stop gradient) + emoji badge. Keys are normalised
// (lowercased, non-letters → underscore) so 'Lab Manager', 'lab_manager', and
// 'lab-manager' all match.
const ROLE_STYLE: Record<string, { from: string; to: string; badge: string }> = {
  super_admin:      { from: '#DC2626', to: '#F87171', badge: '🛡️' },
  administrator:    { from: '#DC2626', to: '#F87171', badge: '🛡️' },
  it_admin:         { from: '#B91C1C', to: '#EF4444', badge: '🛡️' },
  pathologist:      { from: '#7C3AED', to: '#A78BFA', badge: '🔬' },
  lab_manager:      { from: '#EA580C', to: '#FB923C', badge: '📋' },
  manager:          { from: '#EA580C', to: '#FB923C', badge: '📋' },
  quality_manager:  { from: '#D97706', to: '#FBBF24', badge: '✅' },
  department_head:  { from: '#EA580C', to: '#FB923C', badge: '📋' },
  lab_technician:   { from: '#2563EB', to: '#60A5FA', badge: '🧪' },
  technologist:     { from: '#2563EB', to: '#60A5FA', badge: '🧪' },
  scientist:        { from: '#1D4ED8', to: '#60A5FA', badge: '🧫' },
  receptionist:     { from: '#16A34A', to: '#4ADE80', badge: '🛎️' },
  reception:        { from: '#16A34A', to: '#4ADE80', badge: '🛎️' },
  doctor:           { from: '#0891B2', to: '#22D3EE', badge: '🩺' },
  nurse:            { from: '#DB2777', to: '#F472B6', badge: '💉' },
  finance:          { from: '#CA8A04', to: '#FACC15', badge: '💰' },
  viewer:           { from: '#475569', to: '#94A3B8', badge: '👁️' },
  patient:          { from: '#0D9488', to: '#2DD4BF', badge: '🧍' },
  rbc_admin:        { from: '#BE123C', to: '#FB7185', badge: '🩸' },
}

function normRole(role?: string | null): string {
  return (role || '').trim().toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')
}

export default function Avatar({
  src, name, role, size = 36, className = '', showStatus = true, showBadge = true,
}: Props) {
  const [errored, setErrored] = useState(false)

  // Reset error state if src changes (e.g. after a new photo upload)
  useEffect(() => { setErrored(false) }, [src])

  const renderFallback = !src || errored
  const initials = initialsOf(name)

  const roleStyle = ROLE_STYLE[normRole(role)]
  const hue = hueFor(name)
  const bg = roleStyle
    ? `linear-gradient(135deg, ${roleStyle.from} 0%, ${roleStyle.to} 100%)`
    : `linear-gradient(135deg, hsl(${hue}, 65%, 45%) 0%, hsl(${(hue + 25) % 360}, 70%, 55%) 100%)`

  return (
    <div className={`relative inline-block ${className}`} style={{ height: size, width: size }}>
      {!renderFallback ? (
        /* eslint-disable @next/next/no-img-element */
        <img
          src={src!}
          alt={name}
          width={size}
          height={size}
          onError={() => setErrored(true)}
          className="rounded-full object-cover ring-2 ring-white shadow"
          style={{ height: size, width: size, background: '#0a1b2e' }}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center font-semibold text-white ring-2 ring-white shadow"
          style={{ height: size, width: size, background: bg, fontSize: size * 0.4 }}
          aria-label={role ? `${name} (${role})` : name}
        >
          {initials}
        </div>
      )}

      {/* Role badge — top-right corner, on the default avatar only */}
      {renderFallback && roleStyle && showBadge && size >= 28 && (
        <span
          className="absolute -top-0.5 -right-0.5 rounded-full bg-white flex items-center justify-center shadow ring-1 ring-black/5"
          style={{ height: size * 0.42, width: size * 0.42, fontSize: size * 0.24 }}
          title={role || undefined}
        >
          {roleStyle.badge}
        </span>
      )}

      {showStatus && (
        <span
          className="absolute bottom-0 right-0 rounded-full ring-2 ring-white"
          style={{ height: size * 0.27, width: size * 0.27, background: '#10B981' }}
          title="Online"
        />
      )}
    </div>
  )
}
