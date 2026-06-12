'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import RequireAuth from '../../components/RequireAuth'
import { useT, useI18n } from '../../contexts/I18nProvider'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

type ScenarioSummary = {
  id: string
  title: string
  description: string
  duration_minutes: number
  roles: string[]
  modules: string[]
  scenes: string[]
  step_count: number
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}

const ALL_ROLES = ['receptionist', 'lab_technician', 'lab_manager', 'pathologist', 'super_admin']

export default function TrainingHubPage() {
  return <Suspense fallback={null}><TrainingHubGate /></Suspense>
}

function TrainingHubGate() {
  const sp = useSearchParams()
  const isPublic = sp?.get('demo') === '1'
  const body = <TrainingHubInner isPublic={isPublic} />
  return isPublic ? body : <RequireAuth>{body}</RequireAuth>
}

type FeatureSummary = {
  id:          string
  title:       string
  description: string
  scene:       string
  innovations: string[]
  targets:     string[]
}

function TrainingHubInner({ isPublic }: { isPublic: boolean }) {
  const t = useT()
  const { lang } = useI18n()
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [features, setFeatures] = useState<FeatureSummary[]>([])
  const [showGenerate, setShowGenerate] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const headers: Record<string, string> = {}
        if (!isPublic) {
          const tok = getToken()
          if (tok) headers.Authorization = `Bearer ${tok}`
        }
        const url = `${API}/api/v1/training/${isPublic ? 'public/' : ''}scenarios?lang=${lang}`
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setScenarios(data.scenarios || [])

        if (!isPublic) {
          try {
            const fr = await fetch(`${API}/api/v1/training/features`, { headers })
            if (fr.ok) {
              const fd = await fr.json()
              if (!cancelled) setFeatures(fd.features || [])
            }
          } catch { /* features list is optional */ }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load scenarios')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isPublic, lang])

  const filtered = useMemo(() => {
    if (roleFilter === 'all') return scenarios
    return scenarios.filter(s => s.roles.includes(roleFilter))
  }, [scenarios, roleFilter])

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#070a17] to-[#02061a] text-zinc-100 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">{t('train.title')}</h1>
            <p className="text-sm text-zinc-400 max-w-2xl">
              {t('train.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900 p-1 text-xs gap-1">
              <RoleChip current={roleFilter} value="all" set={setRoleFilter}>{t('train.all_roles')}</RoleChip>
              {ALL_ROLES.map(r => (
                <RoleChip key={r} current={roleFilter} value={r} set={setRoleFilter}>{r.replace('_', ' ')}</RoleChip>
              ))}
            </div>
            {!isPublic && features.length > 0 && (
              <button
                type="button"
                onClick={() => setShowGenerate(true)}
                className="rounded-md bg-indigo-500/80 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500"
              >
                {t('train.generate')}
              </button>
            )}
          </div>
        </header>

        {showGenerate && (
          <GenerateDialog
            features={features}
            onClose={() => setShowGenerate(false)}
          />
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-sm text-zinc-500">{t('train.loading')}</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-sm text-zinc-500">{t('train.no_role')}</div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map(s => (
            <ScenarioCard key={s.id} s={s} isPublic={isPublic} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RoleChip({
  current, value, set, children,
}: { current: string; value: string; set: (v: string) => void; children: React.ReactNode }) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => set(value)}
      className={`px-3 py-1.5 rounded-md transition capitalize ${
        active ? 'bg-indigo-500/20 text-indigo-200' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

function GenerateDialog({
  features, onClose,
}: { features: FeatureSummary[]; onClose: () => void }) {
  const t = useT()
  const router = useRouter()
  const [featureId, setFeatureId] = useState(features[0]?.id ?? '')
  const [role, setRole]           = useState('lab_technician')
  const [language, setLanguage]   = useState<'en' | 'fr' | 'rw'>('en')
  const [provider, setProvider]   = useState<'auto' | 'cloud' | 'local' | 'stub'>('auto')
  const [busy, setBusy]           = useState(false)
  const [err, setErr]             = useState<string | null>(null)

  async function run() {
    setBusy(true); setErr(null)
    try {
      const tok = getToken()
      const res = await fetch(`${API}/api/v1/training/generate`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify({ feature_id: featureId, role, language, provider }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`)
      router.push(`/modules/training/${data.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  const f = features.find(x => x.id === featureId)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-950 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">{t('train.gen_title')}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg">×</button>
        </div>
        <p className="text-xs text-zinc-400">
          {t('train.gen_desc')}
        </p>
        {err && <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{err}</div>}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <DialogField label={t('train.f.feature')}>
            <select value={featureId} onChange={(e) => setFeatureId(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5">
              {features.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </DialogField>
          <DialogField label={t('train.f.role')}>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5">
              {ALL_ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </DialogField>
          <DialogField label={t('train.f.language')}>
            <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'fr' | 'rw')}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5">
              <option value="en">{t('train.lang.en')}</option>
              <option value="fr">{t('train.lang.fr')}</option>
              <option value="rw">{t('train.lang.rw')}</option>
            </select>
          </DialogField>
          <DialogField label={t('train.f.provider')}>
            <select value={provider} onChange={(e) => setProvider(e.target.value as 'auto' | 'cloud' | 'local' | 'stub')}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5">
              <option value="auto">{t('train.prov.auto')}</option>
              <option value="cloud">{t('train.prov.cloud')}</option>
              <option value="local">{t('train.prov.local')}</option>
              <option value="stub">{t('train.prov.stub')}</option>
            </select>
          </DialogField>
        </div>
        {f && (
          <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3 text-[11px] space-y-1">
            <div className="text-zinc-400">{f.description}</div>
            {f.innovations.length > 0 && (
              <div className="text-zinc-500">
                <span className="text-zinc-400">{t('train.highlights')}</span> {f.innovations.join(' · ')}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs hover:bg-zinc-800">{t('common.cancel')}</button>
          <button onClick={run} disabled={busy || !featureId}
            className="rounded-md bg-indigo-500/80 px-4 py-1.5 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50">
            {busy ? t('train.generating') : t('train.gen_open')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DialogField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  )
}

function ScenarioCard({ s, isPublic }: { s: ScenarioSummary; isPublic: boolean }) {
  const t = useT()
  const href = `/modules/training/${s.id}${isPublic ? '?demo=1' : ''}`
  return (
    <Link
      href={href}
      className="block rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-indigo-500/40 hover:bg-zinc-900/70 transition"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-medium text-zinc-100">{s.title}</h2>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-200 whitespace-nowrap">
          {t('train.min', { n: s.duration_minutes })}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-400">{s.description}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
        {s.roles.map(r => (
          <span key={r} className="px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-800/60 text-zinc-400 capitalize">
            {r.replace('_', ' ')}
          </span>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">
        {t('train.steps_modules', { n: s.step_count, mods: s.modules.join(', ') })}
      </div>
    </Link>
  )
}
