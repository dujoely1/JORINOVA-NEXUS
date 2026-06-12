'use client'

/**
 * Generic module placeholder.
 *
 * Renders when the dashboard links to a module that doesn't yet have a
 * dedicated page (patients, billing, inventory, ...). Wraps in AppShell
 * so the chrome (header logo, avatar, footer) is consistent across the
 * whole app, even for not-yet-built sections.
 */

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import RequireAuth from '../../components/RequireAuth'
import AppShell    from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const MODULES: Record<string, { label: string; icon: string; desc: string }> = {
  dashboard:     { label: 'Dashboard',        icon: '🏠', desc: 'System overview & KPIs' },
  patients:      { label: 'Patients',         icon: '👤', desc: 'Patient registry & history' },
  laboratory:    { label: 'Laboratory',       icon: '🧪', desc: 'Results & worklists' },
  ai_nexus:      { label: 'AI Nexus',         icon: '🤖', desc: 'Hybrid AI assistant (rules → local → cloud)' },
  billing:       { label: 'Billing & MoMo',   icon: '💳', desc: 'Invoices, Mobile Money, insurance' },
  inventory:     { label: 'Inventory',        icon: '📦', desc: 'Stock levels, reorder triggers, reagent expiry' },
  blood_bank:    { label: 'Blood Bank',       icon: '🩸', desc: 'Chamber/slot tracking, crossmatch, haemovigilance' },
  notifications: { label: 'Notifications',    icon: '🔔', desc: 'SMS alerts, escalations, read-back log' },
  audit:         { label: 'Audit',            icon: '📋', desc: 'PQC signatures, immutable activity log' },
}

const NEXUS_BLUE = '#0066CC'
const MIL_GREEN  = '#4B5320'

export default function ModulePage() {
  const t = useT()
  const params = useParams<{ key: string }>()
  const router = useRouter()
  const key    = params?.key ?? ''
  const module = MODULES[key]

  return (
    <RequireAuth>
      <AppShell pageTag={module?.label ?? 'Module'}>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl bg-white border p-7 shadow-sm" style={{ borderColor: `${NEXUS_BLUE}30` }}>
            <div className="text-5xl">{module?.icon ?? '🧩'}</div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-wide" style={{ color: MIL_GREEN }}>
              {(module?.label ?? key).toUpperCase()}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              {module?.desc ?? t('ph.next')}
            </p>

            {/* Placeholder body */}
            <div className="mt-6 rounded-lg p-4" style={{ background: '#F0F7FF', border: `1px solid ${NEXUS_BLUE}20` }}>
              <div className="text-sm font-semibold text-zinc-900">{t('ph.under_build')}</div>
              <div className="text-sm text-zinc-600 mt-1">
                {t('ph.body')}
              </div>
            </div>

            {/* Navigation */}
            <div className="mt-6 flex flex-wrap gap-2 text-sm">
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 rounded-lg text-white font-medium"
                style={{ background: NEXUS_BLUE }}
              >
                {t('ph.back_dashboard')}
              </button>
              <Link
                href="/modules/training"
                className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              >
                {t('ph.open_demo')}
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  )
}
