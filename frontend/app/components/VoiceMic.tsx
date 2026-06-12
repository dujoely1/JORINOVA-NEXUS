'use client'

/**
 * VoiceMic — hands-free, multilingual voice command bar.
 *
 * Pilot-grade behaviour:
 *   - One tap starts CONTINUOUS listening; it keeps listening and acting
 *     without touching any button again (auto-restarts on end/silence).
 *     Tap again to stop.
 *   - Recognition + speech follow the active UI language (en / fr / rw),
 *     with graceful fallback when the browser lacks a locale.
 *   - Live transcript box shows EXACTLY what was heard, in real time, so the
 *     user always sees it ("ibyo yumvishe").
 *   - Fuzzy self-correction (Levenshtein) maps a misheard word to the closest
 *     known command — e.g. "open peshunts" → "patients" — and shows the
 *     correction.
 *   - Speaks back the action it took via SpeechSynthesis in the user's
 *     language.
 *
 * Mounted once in AppShell, so every authenticated page has it.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n, useT } from '../contexts/I18nProvider'
import type { Lang } from '../lib/i18n'

// ── Command catalogue: word → action ─────────────────────────────────────────

type Action =
  | { kind: 'nav';   path: string }
  | { kind: 'focus'; selector: string }
  | { kind: 'logout' }

const KEYWORDS: { word: string; action: Action }[] = [
  { word: 'dashboard',     action: { kind: 'nav', path: '/dashboard' } },
  { word: 'patients',      action: { kind: 'nav', path: '/modules/patients' } },
  { word: 'register',      action: { kind: 'nav', path: '/modules/register' } },
  { word: 'registers',     action: { kind: 'nav', path: '/modules/register' } },
  { word: 'books',         action: { kind: 'nav', path: '/modules/register' } },
  { word: 'blood',         action: { kind: 'nav', path: '/modules/blood_bank' } },
  { word: 'bank',          action: { kind: 'nav', path: '/modules/blood_bank' } },
  { word: 'inventory',     action: { kind: 'nav', path: '/modules/inventory' } },
  { word: 'billing',       action: { kind: 'nav', path: '/modules/billing' } },
  { word: 'biochemistry',  action: { kind: 'nav', path: '/modules/biochemistry' } },
  { word: 'biochem',       action: { kind: 'nav', path: '/modules/biochemistry' } },
  { word: 'chemistry',     action: { kind: 'nav', path: '/modules/biochemistry' } },
  { word: 'microbiology',  action: { kind: 'nav', path: '/modules/microbiology' } },
  { word: 'micro',         action: { kind: 'nav', path: '/modules/microbiology' } },
  { word: 'bacteriology',  action: { kind: 'nav', path: '/modules/microbiology' } },
  { word: 'parasitology',  action: { kind: 'nav', path: '/modules/microbiology' } },
  { word: 'serology',      action: { kind: 'nav', path: '/modules/serology' } },
  { word: 'hematology',    action: { kind: 'nav', path: '/modules/hematology' } },
  { word: 'coagulation',   action: { kind: 'nav', path: '/modules/coagulation' } },
  { word: 'molecular',     action: { kind: 'nav', path: '/modules/molecular_advanced' } },
  { word: 'genomics',      action: { kind: 'nav', path: '/modules/molecular_advanced' } },
  { word: 'pathology',     action: { kind: 'nav', path: '/modules/anapath' } },
  { word: 'histology',     action: { kind: 'nav', path: '/modules/anapath' } },
  { word: 'cytology',      action: { kind: 'nav', path: '/modules/anapath' } },
  { word: 'toxicology',    action: { kind: 'nav', path: '/modules/toxicology' } },
  { word: 'quality',       action: { kind: 'nav', path: '/modules/quality' } },
  { word: 'levey',         action: { kind: 'nav', path: '/modules/quality' } },
  { word: 'jennings',      action: { kind: 'nav', path: '/modules/quality' } },
  { word: 'surveillance',  action: { kind: 'nav', path: '/modules/surveillance' } },
  { word: 'outbreak',      action: { kind: 'nav', path: '/modules/surveillance' } },
  { word: 'staffhub',      action: { kind: 'nav', path: '/modules/staffhub' } },
  { word: 'staff',         action: { kind: 'nav', path: '/modules/staffhub' } },
  { word: 'notifications', action: { kind: 'nav', path: '/modules/notifications' } },
  { word: 'audit',         action: { kind: 'nav', path: '/modules/audit' } },
  { word: 'admin',         action: { kind: 'nav', path: '/admin' } },
  { word: 'connectivity',  action: { kind: 'nav', path: '/modules/connectivity' } },
  { word: 'settings',      action: { kind: 'nav', path: '/modules/settings' } },
  { word: 'training',      action: { kind: 'nav', path: '/modules/training' } },
  { word: 'help',          action: { kind: 'nav', path: '/modules/help-support' } },
  { word: 'scan',          action: { kind: 'focus', selector: 'input[placeholder*="Scan" i],input[placeholder*="barcode" i],input[placeholder*="sample" i],input[placeholder*="sikana" i],input[placeholder*="scanner" i]' } },
  { word: 'barcode',       action: { kind: 'focus', selector: 'input[placeholder*="Scan" i],input[placeholder*="barcode" i]' } },
  { word: 'sikana',        action: { kind: 'focus', selector: 'input[placeholder*="Scan" i],input[placeholder*="barcode" i],input[placeholder*="sikana" i]' } },
  { word: 'logout',        action: { kind: 'logout' } },
  { word: 'signout',       action: { kind: 'logout' } },
  { word: 'gusohoka',      action: { kind: 'logout' } },
  // Kinyarwanda module aliases
  { word: 'abarwayi',      action: { kind: 'nav', path: '/modules/patients' } },
  { word: 'umurwayi',      action: { kind: 'nav', path: '/modules/patients' } },
  { word: 'ibitabo',       action: { kind: 'nav', path: '/modules/register' } },
  { word: 'amaraso',       action: { kind: 'nav', path: '/modules/blood_bank' } },
  { word: 'ububiko',       action: { kind: 'nav', path: '/modules/inventory' } },
  { word: 'abakozi',       action: { kind: 'nav', path: '/modules/staffhub' } },
  { word: 'ifatura',       action: { kind: 'nav', path: '/modules/billing' } },
  { word: 'amahugurwa',    action: { kind: 'nav', path: '/modules/training' } },
]

// Localized name spoken / written back for each destination path.
const PATH_LABEL: Record<string, { en: string; fr: string; rw: string }> = {
  '/dashboard':                  { en: 'dashboard',            fr: 'le tableau de bord',     rw: 'ahabanza' },
  '/modules/patients':           { en: 'patients',             fr: 'les patients',           rw: 'abarwayi' },
  '/modules/register':           { en: 'the registers',        fr: 'les registres',          rw: 'ibitabo' },
  '/modules/blood_bank':         { en: 'blood bank',           fr: 'la banque de sang',      rw: 'banki y’amaraso' },
  '/modules/inventory':          { en: 'inventory',            fr: 'l’inventaire',           rw: 'ububiko' },
  '/modules/billing':            { en: 'billing',              fr: 'la facturation',         rw: 'ifatura' },
  '/modules/biochemistry':       { en: 'biochemistry',         fr: 'la biochimie',           rw: 'biyokimi' },
  '/modules/microbiology':       { en: 'microbiology',         fr: 'la microbiologie',       rw: 'mikorobiyoloji' },
  '/modules/serology':           { en: 'serology',             fr: 'la sérologie',           rw: 'serolojiya' },
  '/modules/hematology':         { en: 'hematology',           fr: 'l’hématologie',          rw: 'hematolojiya' },
  '/modules/coagulation':        { en: 'coagulation',          fr: 'la coagulation',         rw: 'coagulation' },
  '/modules/molecular_advanced': { en: 'molecular',            fr: 'la biologie moléculaire',rw: 'molekuler' },
  '/modules/anapath':            { en: 'anatomical pathology', fr: 'l’anatomopathologie',    rw: 'patolojiya' },
  '/modules/toxicology':         { en: 'toxicology',           fr: 'la toxicologie',         rw: 'toxicology' },
  '/modules/quality':            { en: 'quality control',      fr: 'le contrôle qualité',    rw: 'ubuziranenge' },
  '/modules/surveillance':       { en: 'surveillance',         fr: 'la surveillance',        rw: 'ibyitabirwa' },
  '/modules/staffhub':           { en: 'staff hub',            fr: 'le personnel',           rw: 'abakozi' },
  '/modules/notifications':      { en: 'notifications',        fr: 'les notifications',      rw: 'imenyesha' },
  '/modules/audit':              { en: 'the audit trail',      fr: 'la piste d’audit',       rw: 'igenzura' },
  '/admin':                      { en: 'the admin console',    fr: 'la console admin',       rw: 'ubuyobozi' },
  '/modules/connectivity':       { en: 'connectivity',         fr: 'la connectivité',        rw: 'guhuza' },
  '/modules/settings':           { en: 'settings',             fr: 'les paramètres',         rw: 'igenamiterere' },
  '/modules/training':           { en: 'training',             fr: 'la formation',           rw: 'amahugurwa' },
  '/modules/help-support':       { en: 'help',                 fr: 'l’aide',                 rw: 'ubufasha' },
}

// ── Fuzzy matcher ───────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr.push(Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
    }
    prev = curr
  }
  return prev[b.length]
}

const STOPWORDS = new Set(['the', 'a', 'an', 'open', 'go', 'to', 'show', 'me', 'please',
                           'hey', 'hello', 'hi', 'jorinova', 'nexus', 'alis',
                           'jya', 'fungura', 'wereka', 'erereka', 'muraho', 'nyabuneka'])

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter(t => t && !STOPWORDS.has(t))
}

function matchCommand(text: string): { kw: typeof KEYWORDS[number]; corrected?: string } | null {
  const tokens = tokenize(text)
  if (!tokens.length) return null
  let best: { kw: typeof KEYWORDS[number]; tok: string; distance: number } | null = null
  for (const tok of tokens) {
    for (const kw of KEYWORDS) {
      if (tok === kw.word) return { kw }
      const allowed = kw.word.length >= 6 ? 2 : 1
      const d = levenshtein(tok, kw.word)
      if (d <= allowed && (!best || d < best.distance)) best = { kw, tok, distance: d }
    }
  }
  if (!best) return null
  return { kw: best.kw, corrected: best.tok !== best.kw.word ? best.kw.word : undefined }
}

// ── Component ───────────────────────────────────────────────────────────────

declare global {
  interface Window {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
  }
}

const LOCALE: Record<Lang, string> = { en: 'en-US', fr: 'fr-FR', rw: 'rw-RW' }

export default function VoiceMic() {
  const router = useRouter()
  const { lang } = useI18n()
  const t = useT()

  const [supported, setSupported] = useState<boolean | null>(null)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [feedback, setFeedback]     = useState('')
  const [corrected, setCorrected]   = useState<string | null>(null)

  const recRef       = useRef<any>(null)
  const listeningRef = useRef(false)
  const localeRef    = useRef<string>(LOCALE[lang] ?? 'en-US')
  const langRef      = useRef<Lang>(lang)
  const lastExecRef  = useRef<{ text: string; at: number }>({ text: '', at: 0 })

  // Keep refs in sync with the active language.
  useEffect(() => {
    langRef.current = lang
    localeRef.current = LOCALE[lang] ?? 'en-US'
  }, [lang])

  // Detect support + preload TTS voices (they load asynchronously).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    setSupported(!!SR)
    try {
      window.speechSynthesis?.getVoices()
      const warm = () => window.speechSynthesis?.getVoices()
      window.speechSynthesis?.addEventListener?.('voiceschanged', warm)
      return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', warm)
    } catch { /* no TTS */ }
  }, [])

  // Stop cleanly on unmount.
  useEffect(() => () => {
    listeningRef.current = false
    try { recRef.current?.stop() } catch { /* noop */ }
  }, [])

  function speak(text: string) {
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      const u = new SpeechSynthesisUtterance(text)
      const l = langRef.current
      u.lang = LOCALE[l] ?? 'en-US'
      const voices = synth.getVoices() || []
      const pick =
        voices.find(v => v.lang?.toLowerCase().startsWith(l)) ||
        (l === 'rw' ? voices.find(v => v.lang?.toLowerCase().startsWith('fr')) : undefined) ||
        voices.find(v => v.lang?.toLowerCase().startsWith('en')) ||
        voices[0]
      if (pick) u.voice = pick
      u.rate = 0.96
      synth.cancel()
      synth.speak(u)
    } catch { /* ignore */ }
  }

  function runMatch(text: string, m: { kw: typeof KEYWORDS[number]; corrected?: string }) {
    // Debounce duplicate finals (continuous mode can emit overlapping results).
    const now = Date.now()
    if (lastExecRef.current.text === m.kw.word && now - lastExecRef.current.at < 1500) return
    lastExecRef.current = { text: m.kw.word, at: now }

    const a = m.kw.action
    let spoken = ''
    if (a.kind === 'nav') {
      const label = PATH_LABEL[a.path]?.[langRef.current] ?? PATH_LABEL[a.path]?.en ?? m.kw.word
      spoken = t('voice.opening', { x: label })
    } else if (a.kind === 'focus') {
      spoken = t('voice.ready_scan')
    } else {
      spoken = t('voice.signing_out')
    }

    setCorrected(m.corrected || null)
    setFeedback(t('voice.understood', { x: spoken }))
    speak(spoken)

    if (a.kind === 'nav') router.push(a.path)
    else if (a.kind === 'focus') {
      const el = document.querySelector<HTMLElement>(a.selector)
      el?.focus?.()
    } else if (a.kind === 'logout') {
      document.querySelector<HTMLButtonElement>('button[title="Sign out"],button[aria-label="Sign out"]')?.click()
    }
  }

  function handleFinal(alts: string[]) {
    const top = alts.find(Boolean) || ''
    if (top) setTranscript(top)
    for (const tt of alts) {
      const m = matchCommand(tt)
      if (m) { runMatch(tt, m); return }
    }
    // No command — keep the heard text visible but stay quiet (hands-free
    // mode hears ambient speech; we must not nag on every phrase).
    setCorrected(null)
    setFeedback('')
  }

  function startRec() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang           = localeRef.current
    rec.continuous     = true
    rec.interimResults = true
    rec.maxAlternatives = 3

    rec.onresult = (ev: any) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]
        if (res.isFinal) {
          const alts: string[] = []
          for (let j = 0; j < res.length; j++) alts.push(res[j]?.transcript || '')
          handleFinal(alts)
        } else {
          interim += res[0]?.transcript || ''
        }
      }
      if (interim) setTranscript(interim)
    }
    rec.onerror = (e: any) => {
      // Locale not available (common for rw-RW) → fall back to English once.
      if ((e?.error === 'language-not-supported' || e?.error === 'not-allowed') && localeRef.current !== 'en-US') {
        localeRef.current = 'en-US'
      }
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        // Permission denied — stop trying.
        listeningRef.current = false
        setListening(false)
      }
    }
    rec.onend = () => {
      recRef.current = null
      if (listeningRef.current) {
        // Hands-free: keep listening across silence / navigation.
        try { startRec() } catch { /* will retry on next tap */ }
      } else {
        setListening(false)
      }
    }
    recRef.current = rec
    try { rec.start() } catch { /* already started */ }
  }

  function toggle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    if (listeningRef.current) {
      listeningRef.current = false
      try { recRef.current?.stop() } catch { /* noop */ }
      setListening(false)
      return
    }
    setTranscript(''); setFeedback(''); setCorrected(null)
    listeningRef.current = true
    setListening(true)
    startRec()
  }

  if (supported === false) {
    return (
      <button
        disabled
        title={t('voice.unsupported')}
        className="inline-flex items-center justify-center h-11 w-11 rounded-full border border-slate-700 bg-slate-800/60 text-slate-500 cursor-not-allowed"
        aria-label={t('voice.unsupported')}
      >🎙</button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        title={listening ? t('voice.listening_hf') : t('voice.tap_hint')}
        className={`inline-flex items-center justify-center h-11 w-11 rounded-full border transition-all ${
          listening
            ? 'bg-rose-500/30 border-rose-400 text-rose-100 animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.6)]'
            : 'bg-sky-500/20 border-sky-400/60 text-sky-200 hover:bg-sky-500/40 hover:scale-105'
        }`}
        aria-label={t('voice.click')}
      ><span className="text-xl">🎙</span></button>

      {listening && !transcript && !feedback && (
        <div className="max-w-[260px] text-right text-[10px] text-sky-300/80 italic">
          {t('voice.listening_hf')}
        </div>
      )}

      {(transcript || feedback) && (
        <div className="max-w-[260px] text-right space-y-0.5">
          {transcript && (
            <div className="text-[10px] text-slate-300 italic truncate" title={transcript}>
              {t('voice.heard')} &ldquo;{transcript}&rdquo;
            </div>
          )}
          {corrected && (
            <div className="text-[10px] text-amber-300">
              {t('voice.corrected')} <span className="font-mono">{corrected}</span>
            </div>
          )}
          {feedback && (
            <div className="text-[10px] text-emerald-300">{feedback}</div>
          )}
        </div>
      )}
    </div>
  )
}
