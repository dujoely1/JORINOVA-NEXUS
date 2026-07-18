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

const API = process.env.NEXT_PUBLIC_API_URL ?? ''
function voiceToken(): string | null {
  if (typeof window === 'undefined') return null
  return document.cookie.split('; ').find(r => r.startsWith('access_token='))?.split('=')[1]
    ?? localStorage.getItem('access_token')
}

// Find the first visible button / link whose text, title or aria-label contains
// one of the given words, and return it (for hands-free "validate", "print", …).
function findClickable(words: string[]): HTMLElement | null {
  const low = words.map(w => w.toLowerCase())
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('button,[role="button"],a'))) {
    if (el.offsetParent === null || (el as HTMLButtonElement).disabled) continue
    const txt = `${el.textContent || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase()
    if (low.some(w => txt.includes(w))) return el
  }
  return null
}

// ── Command catalogue: word → action ─────────────────────────────────────────

type Action =
  | { kind: 'nav';   path: string }
  | { kind: 'focus'; selector: string }
  | { kind: 'click'; match: string[] }
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
  { word: 'medgenome',     action: { kind: 'nav', path: '/modules/medgenome' } },
  { word: 'genome',        action: { kind: 'nav', path: '/modules/medgenome' } },
  // Action verbs — click the matching on-page button, hands-free
  { word: 'validate',      action: { kind: 'click', match: ['validate', 'authorize', 'valider', 'autoriser', 'emeza'] } },
  { word: 'authorize',     action: { kind: 'click', match: ['authorize', 'validate', 'release', 'emeza'] } },
  { word: 'emeza',         action: { kind: 'click', match: ['emeza', 'validate', 'authorize'] } },
  { word: 'approve',       action: { kind: 'click', match: ['approve', 'accept', 'approuver', 'kwemeza'] } },
  { word: 'reject',        action: { kind: 'click', match: ['reject', 'decline', 'rejeter', 'anga'] } },
  { word: 'print',         action: { kind: 'click', match: ['print', 'pdf', 'imprimer', 'sohora', 'chapisha'] } },
  { word: 'save',          action: { kind: 'click', match: ['save', 'submit', 'enregistrer', 'bika'] } },
  { word: 'critical',      action: { kind: 'click', match: ['critical', 'notify', 'critique', 'byihutirwa'] } },
  { word: 'flag',          action: { kind: 'click', match: ['flag', 'critical', 'notify'] } },
  { word: 'search',        action: { kind: 'focus', selector: 'input[type="search"],input[placeholder*="search" i],input[placeholder*="find" i],input[placeholder*="rechercher" i],input[placeholder*="shakisha" i]' } },
  { word: 'shakisha',      action: { kind: 'focus', selector: 'input[type="search"],input[placeholder*="search" i],input[placeholder*="shakisha" i]' } },
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
  // French module aliases
  { word: 'tableau',       action: { kind: 'nav', path: '/dashboard' } },
  { word: 'biochimie',     action: { kind: 'nav', path: '/modules/biochemistry' } },
  { word: 'hematologie',   action: { kind: 'nav', path: '/modules/hematology' } },
  { word: 'hématologie',   action: { kind: 'nav', path: '/modules/hematology' } },
  { word: 'microbiologie', action: { kind: 'nav', path: '/modules/microbiology' } },
  { word: 'serologie',     action: { kind: 'nav', path: '/modules/serology' } },
  { word: 'sérologie',     action: { kind: 'nav', path: '/modules/serology' } },
  { word: 'sang',          action: { kind: 'nav', path: '/modules/blood_bank' } },
  { word: 'inventaire',    action: { kind: 'nav', path: '/modules/inventory' } },
  { word: 'facturation',   action: { kind: 'nav', path: '/modules/billing' } },
  { word: 'qualite',       action: { kind: 'nav', path: '/modules/quality' } },
  { word: 'qualité',       action: { kind: 'nav', path: '/modules/quality' } },
  { word: 'parametres',    action: { kind: 'nav', path: '/modules/settings' } },
  { word: 'paramètres',    action: { kind: 'nav', path: '/modules/settings' } },
  { word: 'aide',          action: { kind: 'nav', path: '/modules/help-support' } },
  { word: 'formation',     action: { kind: 'nav', path: '/modules/training' } },
  { word: 'deconnexion',   action: { kind: 'logout' } },
  { word: 'déconnexion',   action: { kind: 'logout' } },
  { word: 'imprimer',      action: { kind: 'click', match: ['print', 'pdf', 'imprimer', 'sohora'] } },
  { word: 'valider',       action: { kind: 'click', match: ['validate', 'authorize', 'valider', 'emeza'] } },
  { word: 'enregistrer',   action: { kind: 'click', match: ['save', 'submit', 'enregistrer', 'bika'] } },
  // more Kinyarwanda aliases
  { word: 'ubuziranenge',  action: { kind: 'nav', path: '/modules/quality' } },
  { word: 'igenamiterere', action: { kind: 'nav', path: '/modules/settings' } },
  { word: 'ubufasha',      action: { kind: 'nav', path: '/modules/help-support' } },
  { word: 'imenyesha',     action: { kind: 'nav', path: '/modules/notifications' } },
  { word: 'bika',          action: { kind: 'click', match: ['save', 'submit', 'bika', 'enregistrer'] } },
  { word: 'sohora',        action: { kind: 'click', match: ['print', 'pdf', 'sohora', 'imprimer'] } },
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

// ── Wake word ("Hello Nexus") — touchless activation ─────────────────────────
// In touchless mode the assistant IGNORES ambient speech until it hears the wake
// phrase, so it only acts when addressed (distinguishing it from other voices).
const WAKE_WORDS = ['hello nexus', 'hi nexus', 'hey nexus', 'ok nexus', 'okay nexus',
                    'muraho nexus', 'nexus hello', 'nexus']
function hasWake(text: string): boolean {
  const s = text.toLowerCase()
  return WAKE_WORDS.some(w => s.includes(w))
}
function stripWake(text: string): string {
  const s = text.toLowerCase()
  for (const w of WAKE_WORDS) {
    const i = s.indexOf(w)
    if (i >= 0) return s.slice(i + w.length).trim()
  }
  return s.trim()
}

// ── Component ───────────────────────────────────────────────────────────────

declare global {
  interface Window {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
  }
}

const LOCALE: Record<Lang, string> = { en: 'en-US', fr: 'fr-FR', rw: 'rw-RW' }
const WAKE_ACK:  Record<Lang, string> = { en: 'Yes?', fr: 'Oui ?', rw: 'Yego?' }
const SAY_WAKE:  Record<Lang, string> = { en: 'Say “Hello Nexus”…', fr: 'Dites « Hello Nexus »…', rw: 'Vuga «Hello Nexus»…' }
const ARMED_TXT: Record<Lang, string> = { en: 'Listening — say your command', fr: 'À l’écoute — votre commande', rw: 'Ndumva — vuga icyo ushaka' }
const SEND_TXT:  Record<Lang, string> = { en: 'Send', fr: 'Envoyer', rw: 'Ohereza' }
const MODE_TT:   Record<Lang, string> = { en: 'Touchless: needs “Hello Nexus”. Click to switch to tap-to-command.', fr: 'Mains libres : « Hello Nexus ». Cliquez pour passer en mode tactile.', rw: 'Nta gukanda: «Hello Nexus». Kanda uhindure ujye ku bwa gukanda.' }
const DONE_TXT:  Record<Lang, string> = { en: 'Done', fr: 'Fait', rw: 'Byakozwe' }
const NOT_FOUND: Record<Lang, string> = { en: 'Not available on this screen', fr: 'Indisponible sur cet écran', rw: 'Ntibiboneka kuri iyi paji' }
const NO_UNDER:  Record<Lang, string> = { en: 'Sorry, I didn’t catch that', fr: 'Désolé, je n’ai pas compris', rw: 'Mbabarira, sinabyumvise' }

export default function VoiceMic() {
  const router = useRouter()
  const { lang } = useI18n()
  const t = useT()

  const [supported, setSupported] = useState<boolean | null>(null)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [feedback, setFeedback]     = useState('')
  const [corrected, setCorrected]   = useState<string | null>(null)
  const [armed,     setArmed]       = useState(false)   // wake-word heard, ready for a command
  const [wakeMode,  setWakeMode]    = useState(false)   // false = normal (direct commands); true = touchless (needs "Hello Nexus")

  const recRef       = useRef<any>(null)
  const listeningRef = useRef(false)
  const localeRef    = useRef<string>(LOCALE[lang] ?? 'en-US')
  const langRef      = useRef<Lang>(lang)
  const lastExecRef  = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const armedRef     = useRef(false)
  const wakeModeRef  = useRef(false)
  const armTimer     = useRef<any>(null)

  useEffect(() => { wakeModeRef.current = wakeMode }, [wakeMode])

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

    // For a click action, resolve the on-page button first so we can say
    // "not available on this screen" instead of pretending it worked.
    let clickEl: HTMLElement | null = null
    if (a.kind === 'click') {
      clickEl = findClickable(a.match)
      if (!clickEl) {
        setCorrected(m.corrected || null)
        setFeedback(NOT_FOUND[langRef.current] ?? 'Not available')
        speak(NOT_FOUND[langRef.current] ?? '')
        return
      }
    }

    let spoken = ''
    if (a.kind === 'nav') {
      const label = PATH_LABEL[a.path]?.[langRef.current] ?? PATH_LABEL[a.path]?.en ?? m.kw.word
      spoken = t('voice.opening', { x: label })
    } else if (a.kind === 'focus') {
      spoken = t('voice.ready_scan')
    } else if (a.kind === 'click') {
      spoken = `${DONE_TXT[langRef.current] ?? 'Done'} — ${m.kw.word}`
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
    } else if (a.kind === 'click') {
      clickEl?.click()
    } else if (a.kind === 'logout') {
      document.querySelector<HTMLButtonElement>('button[title="Sign out"],button[aria-label="Sign out"]')?.click()
    }
  }

  function arm() {
    armedRef.current = true; setArmed(true)
    if (armTimer.current) clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => { armedRef.current = false; setArmed(false) }, 8000)
  }
  function disarm() {
    armedRef.current = false; setArmed(false)
    if (armTimer.current) { clearTimeout(armTimer.current); armTimer.current = null }
  }

  // Map a backend-parsed action ({action, entity, …}) to a UI action.
  function executeAiAction(j: any) {
    const action = String(j?.action || '').toLowerCase()
    const entity = String(j?.entity || j?.parameters?.name || '').trim()
    const say = (s: string) => { setFeedback(s); speak(s) }

    if (!action || action === 'unknown') { say(NO_UNDER[langRef.current] ?? ''); return }

    if (action === 'open_module' || action === 'navigate' || action === 'open') {
      const m = matchCommand(entity) || matchCommand(String(j?.raw_text || ''))
      if (m) { runMatch(entity || m.kw.word, m); return }
    }
    if (action === 'search_patient' || action === 'open_patient' || action === 'find_patient') {
      const el = document.querySelector<HTMLInputElement>(
        'input[type="search"],input[placeholder*="search" i],input[placeholder*="patient" i],input[placeholder*="shakisha" i],input[placeholder*="rechercher" i]')
      if (el) {
        el.focus()
        if (entity) { el.value = entity; el.dispatchEvent(new Event('input', { bubbles: true })) }
        say(DONE_TXT[langRef.current] ?? 'Done'); return
      }
      router.push('/modules/patients'); say(DONE_TXT[langRef.current] ?? 'Done'); return
    }
    const CLICKS: Record<string, string[]> = {
      validate_result: ['validate', 'authorize', 'emeza'],
      authorize:       ['authorize', 'validate', 'emeza'],
      print_report:    ['print', 'pdf', 'sohora'],
      flag_critical:   ['critical', 'notify', 'byihutirwa'],
      save:            ['save', 'submit', 'bika'],
      reject:          ['reject', 'decline', 'anga'],
    }
    if (CLICKS[action]) {
      const btn = findClickable(CLICKS[action])
      say(btn ? (DONE_TXT[langRef.current] ?? 'Done') : (NOT_FOUND[langRef.current] ?? ''))
      btn?.click(); return
    }
    if (action === 'add_note') {
      document.querySelector<HTMLElement>('textarea,[placeholder*="note" i]')?.focus?.()
      say(DONE_TXT[langRef.current] ?? 'Done'); return
    }
    if (action === 'logout' || action === 'signout') {
      const kw = KEYWORDS.find(k => k.word === 'logout'); if (kw) runMatch('logout', { kw }); return
    }
    const m = matchCommand(entity)
    if (m) runMatch(entity, m); else say(NO_UNDER[langRef.current] ?? '')
  }

  // Free-form speech → backend NL parser (rules + local LLM), then execute.
  async function aiFallback(text: string) {
    const clean = (wakeModeRef.current ? stripWake(text) : text).trim()
    if (!clean) return
    setFeedback('…')
    try {
      const tok = voiceToken()
      const r = await fetch(`${API}/api/v1/ai/speech/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ text: clean }),
      })
      if (!r.ok) { setFeedback(''); return }
      executeAiAction(await r.json())
    } catch { setFeedback('') }
  }

  function handleFinal(alts: string[]) {
    const top = alts.find(Boolean) || ''
    if (top) setTranscript(top)

    // Normal (always-on) mode: keyword → else backend NL parser.
    if (!wakeModeRef.current) {
      for (const tt of alts) { const m = matchCommand(tt); if (m) { runMatch(tt, m); return } }
      aiFallback(top); return
    }

    // Touchless mode — only respond once addressed with "Hello Nexus".
    if (alts.some(hasWake)) {
      for (const tt of alts) { const m = matchCommand(stripWake(tt)); if (m) { disarm(); runMatch(tt, m); return } }
      const rest = stripWake(top)
      if (rest) { disarm(); aiFallback(rest); return }   // "Hello Nexus, <free command>"
      arm(); speak(WAKE_ACK[langRef.current] ?? 'Yes?')   // wake word alone → arm
      setCorrected(null); setFeedback(ARMED_TXT[langRef.current] ?? '')
      return
    }
    if (armedRef.current) {
      for (const tt of alts) { const m = matchCommand(tt); if (m) { disarm(); runMatch(tt, m); return } }
      disarm(); aiFallback(top); return
    }
    // Not addressed → ignore ambient speech.
    setCorrected(null); setFeedback('')
  }

  // "Send" button — submit exactly what was heard (keyword → else NL parser),
  // the non-touchless way, without needing the wake word.
  function sendNow() {
    const text = transcript.trim()
    if (!text) return
    const clean = wakeModeRef.current ? stripWake(text) : text
    const m = matchCommand(clean) || matchCommand(text)
    disarm()
    if (m) runMatch(text, m); else aiFallback(clean || text)
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
      disarm()
      return
    }
    setTranscript(''); setFeedback(''); setCorrected(null); disarm()
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
      <div className="flex items-center gap-1.5">
        {/* Send (button-triggered) — the non-touchless way to submit what was heard */}
        {listening && transcript && (
          <button onClick={sendNow} title={SEND_TXT[lang]}
            className="h-9 px-3 rounded-full border border-emerald-400/60 bg-emerald-500/20 text-emerald-100 text-xs font-semibold hover:bg-emerald-500/40">
            ➤ {SEND_TXT[lang]}
          </button>
        )}
        {/* Touchless (wake word) ↔ normal (tap) toggle */}
        <button onClick={() => setWakeMode(m => !m)} title={MODE_TT[lang]}
          className={`h-9 px-2.5 rounded-full border text-xs font-semibold transition-colors ${
            wakeMode ? 'border-violet-400/60 bg-violet-500/20 text-violet-100' : 'border-slate-600 bg-slate-800/60 text-slate-300'}`}>
          {wakeMode ? '🌊 Hello Nexus' : '👆 Tap'}
        </button>
        {/* Mic — green pulse when armed (wake word heard), rose while just listening */}
        <button
          onClick={toggle}
          title={listening ? t('voice.listening_hf') : t('voice.tap_hint')}
          className={`inline-flex items-center justify-center h-11 w-11 rounded-full border transition-all ${
            listening
              ? (armed
                  ? 'bg-emerald-500/30 border-emerald-400 text-emerald-100 animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.6)]'
                  : 'bg-rose-500/30 border-rose-400 text-rose-100 animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.6)]')
              : 'bg-sky-500/20 border-sky-400/60 text-sky-200 hover:bg-sky-500/40 hover:scale-105'
          }`}
          aria-label={t('voice.click')}
        ><span className="text-xl">🎙</span></button>
      </div>

      {listening && !transcript && !feedback && (
        <div className="max-w-[260px] text-right text-[10px] italic text-sky-300/80">
          {wakeMode ? (armed ? ARMED_TXT[lang] : SAY_WAKE[lang]) : t('voice.listening_hf')}
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
