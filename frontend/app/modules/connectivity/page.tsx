'use client'

/**
 * Connectivity module — system health, integrations, sync queue.
 * Pulls /api/v1/admin/modules and /api/v1/sync/* if available.
 */
import { useEffect, useState } from 'react'
import RequireAuth from '../../components/RequireAuth'
import AppShell from '../../components/AppShell'
import { useT } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL || ''
function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}
function authHeaders(): HeadersInit { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {} }

interface Module { name: string; status: string; route: string }
interface AIStatus { offline_capable?: boolean; rules_engine?: { available: boolean }; local_llm?: { available: boolean; model?: string }; cloud_llm?: { available: boolean; model?: string } }

export default function ConnectivityPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Connectivity" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [modules, setModules] = useState<Module[]>([])
  const [ai, setAi]           = useState<AIStatus | null>(null)
  const [health, setHealth]   = useState<any>(null)
  const [err, setErr]         = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/api/v1/admin/modules`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { modules: [] })
      .then(j => setModules(j.modules || []))
      .catch(() => {})
    fetch(`${API}/api/v1/ai/status`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null).then(setAi).catch(() => {})
    fetch(`${API}/api/v1/health`)
      .then(r => r.ok ? r.json() : null).then(setHealth).catch(() => {})
  }, [])

  const opCount   = modules.filter(m => m.status === 'operational').length
  const totalMods = modules.length

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(56,189,248,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(56,189,248,0.06) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-sky-200" style={{ textShadow: '0 0 20px rgba(56,189,248,0.30)' }}>
            🌐 {t('mod.connectivity')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.connectivity.sub')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 space-y-5">
        {/* Health card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label={t('conn.kpi.backend')} value={health ? t('conn.online') : t('conn.offline')} accent={health ? '#22C55E' : '#DC2626'} />
          <KpiCard label={t('conn.kpi.version')} value={health?.version || '—'} accent="#0066CC" />
          <KpiCard label={t('conn.kpi.modules')} value={`${opCount}/${totalMods || '—'}`} accent="#A855F7" />
          <KpiCard label={t('conn.kpi.ai_offline')} value={ai?.offline_capable ? t('conn.yes') : '—'} accent="#22C55E" />
        </div>

        {/* AI layers */}
        {ai && (
          <section className="rounded-xl border border-sky-400/30 bg-slate-900/60 p-4">
            <h3 className="text-[11px] uppercase tracking-widest font-bold text-sky-300 mb-3">{t('conn.ai_layers')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Layer label={t('conn.layer.rules')} on={!!ai.rules_engine?.available} sub={t('conn.layer.rules.s')} />
              <Layer label={`${t('conn.layer.local')} ${ai.local_llm?.model ? `(${ai.local_llm.model})` : ''}`} on={!!ai.local_llm?.available} sub={t('conn.layer.local.s')} />
              <Layer label={`${t('conn.layer.cloud')} ${ai.cloud_llm?.model ? `(${ai.cloud_llm.model})` : ''}`} on={!!ai.cloud_llm?.available} sub={t('conn.layer.cloud.s')} />
            </div>
          </section>
        )}

        {/* Modules health */}
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <h3 className="text-[11px] uppercase tracking-widest font-bold text-sky-300 mb-3">{t('conn.mod_health')}</h3>
          {err && <div className="text-xs text-rose-300 mb-2">⚠ {err}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {modules.length === 0 && <div className="text-xs text-slate-500 col-span-3">{t('conn.no_modules')}</div>}
            {modules.map(m => (
              <div key={m.name} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
                <div>
                  <div className="text-sm text-slate-100 font-semibold">{m.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{m.route}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  m.status === 'operational' ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30' :
                  'text-amber-300 bg-amber-500/15 border-amber-400/30'
                }`}>{m.status}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Integration placeholders */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <IntegrationCard title={t('conn.int.hl7')} desc={t('conn.int.hl7.d')} status={t('conn.st.scaffolded')} />
          <IntegrationCard title={t('conn.int.iot')} desc={t('conn.int.iot.d')} status={t('conn.st.ingestion')} />
          <IntegrationCard title={t('conn.int.sync')} desc={t('conn.int.sync.d')} status={t('conn.st.planned')} />
        </section>
      </div>
    </>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: any; accent: string }) {
  return (
    <div className="rounded-xl bg-slate-900/60 backdrop-blur p-3 border" style={{ borderColor: `${accent}55`, boxShadow: `0 0 14px ${accent}1F` }}>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>{label}</div>
      <div className="text-xl font-extrabold text-slate-100 mt-0.5" style={{ textShadow: `0 0 14px ${accent}55` }}>{value}</div>
    </div>
  )
}

function Layer({ label, on, sub }: { label: string; on: boolean; sub: string }) {
  const t = useT()
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${on ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
        <span className="text-sm text-slate-100 font-semibold">{label}</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-1">{sub}</div>
      <div className={`mt-2 text-[10px] uppercase font-bold ${on ? 'text-emerald-300' : 'text-slate-500'}`}>{on ? t('conn.online') : t('conn.offline')}</div>
    </div>
  )
}

function IntegrationCard({ title, desc, status }: { title: string; desc: string; status: string }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <span className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">{status}</span>
      </div>
      <div className="text-xs text-slate-400 mt-1">{desc}</div>
    </div>
  )
}
