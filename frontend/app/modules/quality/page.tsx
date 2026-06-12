'use client'

/**
 * Quality / Levey-Jennings module.
 *
 * Renders a real LJ chart in inline SVG (no chart-library dep) plus a
 * Westgard violations panel and IQC stats. Pulls
 *   GET /api/v1/quality/iqc/analytes
 *   GET /api/v1/quality/iqc/levey-jennings?department=&analyte_code=&control_level=&days=
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
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

interface LJPoint { id: number; run_date: string; value: number; z_score: number; status: string; westgard_rule?: string; operator?: string; analyzer?: string; lot?: string }
interface LJStats { target_mean: number; target_sd: number; actual_mean: number; actual_sd: number; cv_pct: number; n: number; pass_rate: number; violations: number }
interface Westgard { rule: string; index: number; severity: string; description: string; action: string }
interface SDLines { mean: number; plus1: number; plus2: number; plus3: number; minus1: number; minus2: number; minus3: number }
interface LJResponse {
  analyte: string; department: string; control_level: string; period_days: number; unit?: string
  points: LJPoint[]; stats: LJStats; westgard: Westgard[]; run_decision: string; sd_lines: SDLines
}
interface AnalyteOpt { department: string; analyte_code: string; analyte_name?: string; levels?: string[] }

export default function QualityPage() {
  return (
    <RequireAuth>
      <AppShell pageTag="Quality / Levey-Jennings" theme="dark">
        <Inner />
      </AppShell>
    </RequireAuth>
  )
}

function Inner() {
  const t = useT()
  const [analytes, setAnalytes] = useState<AnalyteOpt[]>([])
  const [dept,     setDept]     = useState('HEM')
  const [analyte,  setAnalyte]  = useState('')
  const [level,    setLevel]    = useState('L1')
  const [days,     setDays]     = useState(30)
  const [data,     setData]     = useState<LJResponse | null>(null)
  const [err,      setErr]      = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    fetch(`${API}/api/v1/quality/iqc/analytes`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(j => {
        const list: AnalyteOpt[] = Array.isArray(j) ? j : (j.analytes || [])
        setAnalytes(list)
        if (list.length && !analyte) {
          const first = list[0]
          setDept(first.department || 'HEM')
          setAnalyte(first.analyte_code || '')
        }
      })
      .catch(() => {})
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    if (!analyte) return
    setLoading(true); setErr(null); setData(null)
    const p = new URLSearchParams({ department: dept, analyte_code: analyte, control_level: level, days: String(days) })
    fetch(`${API}/api/v1/quality/iqc/levey-jennings?${p.toString()}`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status} — ${(await r.text()).slice(0, 80)}`); return r.json() })
      .then(setData).catch(e => setErr(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [dept, analyte, level, days])
  useEffect(load, [load])

  const deptsAvail = useMemo(() => Array.from(new Set(analytes.map(a => a.department))), [analytes])
  const analytesForDept = useMemo(() => analytes.filter(a => a.department === dept), [analytes, dept])

  return (
    <>
      <section className="border-b" style={{ borderColor: 'rgba(0,131,143,0.30)', background: 'linear-gradient(180deg, rgba(2,8,23,0) 0%, rgba(0,131,143,0.06) 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide text-cyan-200" style={{ textShadow: '0 0 20px rgba(0,131,143,0.30)' }}>
            📐 {t('mod.quality')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t('mod.quality.sub')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900/60 border border-slate-700/60 p-3">
          <select value={dept} onChange={e => setDept(e.target.value)} className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100">
            {deptsAvail.length === 0 && <option value="HEM">{t('qc.no_data_dept', { d: 'HEM' })}</option>}
            {deptsAvail.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={analyte} onChange={e => setAnalyte(e.target.value)} className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100">
            {analytesForDept.length === 0 && <option value="">{t('qc.no_analytes')}</option>}
            {analytesForDept.map(a => <option key={a.analyte_code} value={a.analyte_code}>{a.analyte_code} {a.analyte_name && `· ${a.analyte_name}`}</option>)}
          </select>
          <select value={level} onChange={e => setLevel(e.target.value)} className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100">
            <option value="L1">{t('qc.lvl.l1')}</option>
            <option value="L2">{t('qc.lvl.l2')}</option>
            <option value="L3">{t('qc.lvl.l3')}</option>
          </select>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100">
            <option value={7}>{t('qc.days', { n: 7 })}</option>
            <option value={14}>{t('qc.days', { n: 14 })}</option>
            <option value={30}>{t('qc.days', { n: 30 })}</option>
            <option value={60}>{t('qc.days', { n: 60 })}</option>
            <option value={90}>{t('qc.days', { n: 90 })}</option>
          </select>
          <button onClick={load} className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-cyan-600 text-white font-semibold">{t('common.refresh')}</button>
        </div>

        {err && <div className="rounded-lg bg-rose-900/30 border border-rose-700/50 px-3 py-2 text-sm text-rose-200">⚠ {err}</div>}
        {loading && <div className="text-sm text-slate-400">{t('qc.loading')}</div>}

        {data && (
          <>
            {/* Run decision banner */}
            <div className={`rounded-xl border px-4 py-3 flex items-center justify-between flex-wrap gap-2 ${
              data.run_decision === 'ACCEPT' ? 'bg-emerald-500/10 border-emerald-400/40' :
              data.run_decision === 'WARN'   ? 'bg-amber-500/10 border-amber-400/40' :
              data.run_decision === 'REJECT' ? 'bg-rose-500/15 border-rose-400/50' :
              'bg-slate-800/40 border-slate-600'
            }`}>
              <div className={`text-xl font-extrabold ${
                data.run_decision === 'ACCEPT' ? 'text-emerald-300' :
                data.run_decision === 'WARN'   ? 'text-amber-300' :
                data.run_decision === 'REJECT' ? 'text-rose-300' : 'text-slate-300'
              }`}>{t('qc.run_decision')} · {data.run_decision}</div>
              <div className="text-xs text-slate-400">
                {data.analyte} · {data.control_level} · {t('qc.window', { n: data.period_days })} · n = {data.stats.n}
              </div>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Kpi label={t('qc.kpi.pass')}        value={`${data.stats.pass_rate ?? 0}%`}  accent="#22C55E" />
              <Kpi label="CV%"                     value={data.stats.cv_pct ?? '—'}         accent="#06B6D4" />
              <Kpi label={t('qc.kpi.target_mean')} value={data.stats.target_mean ?? '—'}    accent="#0066CC" />
              <Kpi label={t('qc.kpi.actual_mean')} value={data.stats.actual_mean ?? '—'}    accent="#A855F7" />
              <Kpi label={t('qc.kpi.violations')}  value={data.stats.violations ?? 0}       accent="#DC2626" />
            </div>

            {/* LJ chart */}
            <LJChart data={data} />

            {/* Westgard violations */}
            {data.westgard.length > 0 && (
              <section className="rounded-xl border border-rose-400/30 bg-slate-900/60 p-4">
                <h3 className="text-[11px] uppercase tracking-widest font-bold text-rose-300 mb-2">{t('qc.westgard')}</h3>
                <div className="space-y-1.5">
                  {data.westgard.map((w, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs py-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                        w.severity === 'REJECT' ? 'text-rose-300 bg-rose-500/15 border-rose-400/30' : 'text-amber-300 bg-amber-500/15 border-amber-400/30'
                      }`}>{w.rule}</span>
                      <div className="flex-1">
                        <div className="text-slate-200">{w.description}</div>
                        <div className="text-slate-500">{t('qc.action')} {w.action}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!loading && !data && !err && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-10 text-center text-slate-400 text-sm">
            {t('qc.empty')}
          </div>
        )}
      </div>
    </>
  )
}

// ── LJ Chart (inline SVG, no deps) ──────────────────────────────────────────

function LJChart({ data }: { data: LJResponse }) {
  if (!data.points.length) return null
  const W = 900, H = 320, PAD_L = 60, PAD_R = 20, PAD_T = 20, PAD_B = 50
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B

  const { mean, plus1, plus2, plus3, minus1, minus2, minus3 } = data.sd_lines
  // y range: ±3.5 SD around mean
  const sd = data.stats.target_sd || 1
  const yMin = mean - 3.5 * sd
  const yMax = mean + 3.5 * sd
  const xOf = (i: number) => PAD_L + (data.points.length === 1 ? innerW / 2 : (i / (data.points.length - 1)) * innerW)
  const yOf = (v: number) => PAD_T + ((yMax - v) / (yMax - yMin)) * innerH

  const path = data.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(p.value)}`).join(' ')

  return (
    <section className="rounded-xl border border-cyan-400/30 bg-slate-900/60 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minHeight: 280 }}>
        {/* SD band shading */}
        <rect x={PAD_L} y={yOf(plus2)} width={innerW} height={yOf(minus2) - yOf(plus2)} fill="rgba(34,197,94,0.05)" />
        <rect x={PAD_L} y={yOf(plus3)} width={innerW} height={yOf(plus2)  - yOf(plus3)}  fill="rgba(245,158,11,0.08)" />
        <rect x={PAD_L} y={yOf(minus2)} width={innerW} height={yOf(minus3) - yOf(minus2)} fill="rgba(245,158,11,0.08)" />

        {/* SD lines */}
        {[
          ['+3SD', plus3,  '#DC2626'],
          ['+2SD', plus2,  '#F59E0B'],
          ['+1SD', plus1,  '#94A3B8'],
          ['Mean', mean,   '#22C55E'],
          ['-1SD', minus1, '#94A3B8'],
          ['-2SD', minus2, '#F59E0B'],
          ['-3SD', minus3, '#DC2626'],
        ].map(([label, v, color]) => (
          <g key={label as string}>
            <line x1={PAD_L} x2={PAD_L + innerW} y1={yOf(v as number)} y2={yOf(v as number)}
              stroke={color as string} strokeWidth={label === 'Mean' ? 1.5 : 0.8}
              strokeDasharray={label === 'Mean' ? '0' : '4,4'} />
            <text x={PAD_L - 6} y={yOf(v as number) + 4} fontSize="10" fill={color as string} textAnchor="end">
              {label} · {(v as number).toFixed(2)}
            </text>
          </g>
        ))}

        {/* Data line */}
        <path d={path} fill="none" stroke="#38BDF8" strokeWidth="1.5" />

        {/* Data points */}
        {data.points.map((p, i) => {
          const color = p.status === 'PASS' ? '#22C55E' : p.status === 'WARN' ? '#F59E0B' : '#DC2626'
          return (
            <g key={p.id}>
              <circle cx={xOf(i)} cy={yOf(p.value)} r={p.westgard_rule ? 6 : 4} fill={color} stroke="white" strokeWidth="1">
                <title>{`${p.run_date}\nValue: ${p.value}\nZ: ${p.z_score}\nStatus: ${p.status}${p.westgard_rule ? `\nRule: ${p.westgard_rule}` : ''}`}</title>
              </circle>
            </g>
          )
        })}

        {/* X-axis dates (first, mid, last) */}
        {[0, Math.floor(data.points.length / 2), data.points.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => (
          <text key={i} x={xOf(i)} y={H - 18} fontSize="10" fill="#94A3B8" textAnchor="middle">{data.points[i].run_date.slice(5)}</text>
        ))}

        {/* Legend */}
        <text x={PAD_L} y={H - 4} fontSize="10" fill="#64748B">
          {data.analyte} · {data.control_level} · {data.unit || ''} · n={data.points.length}
        </text>
      </svg>
    </section>
  )
}

function Kpi({ label, value, accent }: { label: string; value: any; accent: string }) {
  return (
    <div className="rounded-xl bg-slate-900/60 backdrop-blur p-3 border" style={{ borderColor: `${accent}55`, boxShadow: `0 0 14px ${accent}1F` }}>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>{label}</div>
      <div className="text-xl font-extrabold text-slate-100 mt-0.5">{value}</div>
    </div>
  )
}
