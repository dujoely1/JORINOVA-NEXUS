'use client'

/**
 * LabelModal — generate a printable specimen label with a real Code39
 * barcode + department-colored background, right from any module page.
 *
 * Code39 implementation is inline (no npm dep) — same algorithm as a
 * standard barcode library, ~40 lines, generates an SVG you can print
 * or save. Code39 was chosen because every hospital handheld scanner
 * supports it without configuration.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

// ── Dept palette (background + accent) ──────────────────────────────────────

export const DEPT_THEMES: Record<string, { name: string; bg: string; ink: string; chip: string }> = {
  HEM:        { name: 'Hematology',   bg: '#FCE4E4', ink: '#7F1D1D', chip: '#DC2626' },
  COAG:       { name: 'Coagulation',  bg: '#DBEAFE', ink: '#1E3A8A', chip: '#1D4ED8' },
  BIOCHEM:    { name: 'Biochemistry', bg: '#FEF3C7', ink: '#78350F', chip: '#D97706' },
  HORMONE:    { name: 'Endocrinology',bg: '#DBEAFE', ink: '#1E3A8A', chip: '#1D4ED8' },
  CARDIAC:    { name: 'Cardiac',      bg: '#FECACA', ink: '#7F1D1D', chip: '#DC2626' },
  TUMOUR:     { name: 'Tumour mkr',   bg: '#FCE7F3', ink: '#831843', chip: '#BE185D' },
  SERO:       { name: 'Serology',     bg: '#FFE4E6', ink: '#9F1239', chip: '#E11D48' },
  MICRO:      { name: 'Microbiology', bg: '#EDE9FE', ink: '#4C1D95', chip: '#7C3AED' },
  MOL:        { name: 'Molecular',    bg: '#F3E8FF', ink: '#581C87', chip: '#9333EA' },
  URN:        { name: 'Urinalysis',   bg: '#FEF9C3', ink: '#713F12', chip: '#CA8A04' },
  BB:         { name: 'Blood Bank',   bg: '#FECACA', ink: '#7F1D1D', chip: '#B91C1C' },
  ANAPATH:    { name: 'Anat. Path',   bg: '#F3E8FF', ink: '#4C1D95', chip: '#7B1FA2' },
  TOX:        { name: 'Toxicology',   bg: '#FED7AA', ink: '#7C2D12', chip: '#EA580C' },
  QM:         { name: 'Quality',      bg: '#CFFAFE', ink: '#155E75', chip: '#0E7490' },
  RECEPTION:  { name: 'Reception',    bg: '#E0E7FF', ink: '#1E3A8A', chip: '#4338CA' },
}

// ── Code39 encoder ──────────────────────────────────────────────────────────
// Each character → 9 elements: 5 bars + 4 spaces, 3 wide + 6 narrow.
// '1' = wide bar/space, '0' = narrow. The full string is bar, space, bar, ...
// Start/stop char is '*'.
const C39: Record<string, string> = {
  '0':'101001101101','1':'110100101011','2':'101100101011','3':'110110010101',
  '4':'101001101011','5':'110100110101','6':'101100110101','7':'101001011011',
  '8':'110100101101','9':'101100101101','A':'110101001011','B':'101101001011',
  'C':'110110100101','D':'101011001011','E':'110101100101','F':'101101100101',
  'G':'101010011011','H':'110101001101','I':'101101001101','J':'101011001101',
  'K':'110101010011','L':'101101010011','M':'110110101001','N':'101011010011',
  'O':'110101101001','P':'101101101001','Q':'101010110011','R':'110101011001',
  'S':'101101011001','T':'101011011001','U':'110010101011','V':'100110101011',
  'W':'110011010101','X':'100101101011','Y':'110010110101','Z':'100110110101',
  '-':'100101011011','.':'110010101101',' ':'100110101101','$':'100100100101',
  '/':'100100101001','+':'100101001001','%':'101001001001','*':'100101101101',
}

function code39SVG(rawText: string, opts: { barUnit?: number; height?: number } = {}): {
  svg: string; width: number; height: number; sanitized: string
} {
  const allowed = /[0-9A-Z\-. $/+%]/
  const sanitized = rawText.toUpperCase().split('').filter(c => allowed.test(c)).join('') || 'SAMPLE'
  const padded = `*${sanitized}*`
  const u = opts.barUnit ?? 2
  const h = opts.height  ?? 60
  const widths: number[] = []
  // Each char's 12 bits — bar/space alternating; '1' = wide (=3u), '0' = narrow (=u)
  for (let i = 0; i < padded.length; i++) {
    const ch = padded[i]
    const pattern = C39[ch]
    if (!pattern) continue
    for (let j = 0; j < pattern.length; j++) widths.push(pattern[j] === '1' ? 3 * u : u)
    // inter-character gap
    if (i !== padded.length - 1) widths.push(u)
  }
  let x = 0
  const rects: string[] = []
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i]
    if (i % 2 === 0) {               // even indices are bars
      rects.push(`<rect x="${x}" y="0" width="${w}" height="${h}" fill="black"/>`)
    }
    x += w
  }
  const W = x
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" shape-rendering="crispEdges">${rects.join('')}</svg>`
  return { svg, width: W, height: h, sanitized }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function LabelModal({ onClose }: { onClose: () => void }) {
  const [sampleId,  setSampleId]  = useState('S-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-001')
  const [patient,   setPatient]   = useState('')
  const [pid,       setPid]       = useState('')
  const [dept,      setDept]      = useState<keyof typeof DEPT_THEMES>('HEM')
  const [test,      setTest]      = useState('CBC')
  const [tube,      setTube]      = useState('EDTA (purple)')
  const [priority,  setPriority]  = useState('routine')
  const labelRef = useRef<HTMLDivElement>(null)

  const theme = DEPT_THEMES[dept]
  const code  = useMemo(() => code39SVG(sampleId, { barUnit: 2, height: 50 }), [sampleId])

  function printLabel() {
    if (!labelRef.current) return
    const html = labelRef.current.outerHTML
    const w = window.open('', '_blank', 'width=420,height=300')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>Label ${sampleId}</title>
      <style>
        @page { size: 80mm 40mm; margin: 0 }
        body  { margin: 0; padding: 4px; font-family: -apple-system, system-ui, sans-serif }
        * { box-sizing: border-box }
        .lbl { width: 76mm; height: 38mm; padding: 6px 8px; border-radius: 6px;
               border: 1px solid #00000020; }
        .lbl .top { display:flex; align-items:flex-start; justify-content:space-between; gap:4px }
        .lbl .id  { font-size: 18px; font-weight: 700; font-family: ui-monospace, Menlo, monospace }
        .lbl .nm  { font-size: 12px; font-weight: 600; margin-top: 2px }
        .lbl .meta{ font-size: 10px; margin-top: 1px; opacity: .8 }
        .lbl .chip{ font-size: 9px; padding: 1px 5px; border-radius: 4px; color: white; font-weight: 700; letter-spacing: .5px }
        .lbl svg  { width: 100%; height: 24mm; max-height: 24mm; margin-top: 4px }
      </style></head><body>${html}<script>window.print();setTimeout(()=>window.close(),300)</script></body></html>`)
    w.document.close()
  }

  function downloadSVG() {
    const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="800" height="400">
      <rect width="100%" height="100%" fill="${theme.bg}" rx="12"/>
      <text x="20" y="50" font-family="system-ui" font-size="34" font-weight="700" fill="${theme.ink}" font-family="ui-monospace">${sampleId}</text>
      <rect x="600" y="20" width="${theme.name.length * 12 + 20}" height="26" rx="4" fill="${theme.chip}"/>
      <text x="610" y="38" font-family="system-ui" font-size="13" font-weight="700" fill="white">${theme.name.toUpperCase()}</text>
      <text x="20" y="85"  font-family="system-ui" font-size="20" font-weight="600" fill="${theme.ink}">${patient || '(no name)'}</text>
      <text x="20" y="112" font-family="system-ui" font-size="14" fill="${theme.ink}">PID ${pid || '—'} · ${test} · ${tube} · ${priority.toUpperCase()}</text>
      <g transform="translate(20, 140)">${code.svg.replace(/^<svg[^>]*>|<\/svg>$/g,'')}</g>
      <text x="20" y="${140 + code.height + 18}" font-family="ui-monospace" font-size="12" fill="${theme.ink}">${code.sanitized}</text>
    </svg>`
    const blob = new Blob([labelSvg], { type: 'image/svg+xml' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `label-${sampleId}.svg`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-amber-400/40 rounded-2xl max-w-3xl w-full p-5 shadow-2xl"
           style={{ boxShadow: '0 0 40px rgba(245,158,11,0.15)' }}>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-lg font-bold text-amber-200">🏷️ Specimen label &amp; barcode</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl">×</button>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          Code39 barcode · department-coloured background · prints to a 80×40 mm thermal label or downloads as SVG.
        </p>

        {/* Inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Sample ID *">
            <input value={sampleId} onChange={e => setSampleId(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 font-mono w-full" />
          </Field>
          <Field label="Patient name">
            <input value={patient} onChange={e => setPatient(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full" />
          </Field>
          <Field label="PID">
            <input value={pid} onChange={e => setPid(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 font-mono w-full" />
          </Field>
          <Field label="Department">
            <select value={dept} onChange={e => setDept(e.target.value as keyof typeof DEPT_THEMES)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full">
              {Object.entries(DEPT_THEMES).map(([k, v]) => <option key={k} value={k}>{k} · {v.name}</option>)}
            </select>
          </Field>
          <Field label="Test / panel">
            <input value={test} onChange={e => setTest(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full" />
          </Field>
          <Field label="Tube">
            <select value={tube} onChange={e => setTube(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full">
              {['EDTA (purple)','Citrate (blue)','SST (gold/yellow)','Fluoride (grey)','Plain (red)','Heparin (green)','Urine cup','Stool pot','Swab'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-slate-100 w-full">
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
          </Field>
        </div>

        {/* Preview */}
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">Preview (80 × 40 mm)</div>
          <div
            ref={labelRef}
            className="lbl mx-auto"
            style={{
              width: '320px', minHeight: '170px',
              background: theme.bg, color: theme.ink,
              borderRadius: '6px', border: '1px solid #00000020',
              padding: '10px 12px',
            }}
          >
            <div className="top" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'4px' }}>
              <div>
                <div className="id" style={{ fontSize:'18px', fontWeight:700, fontFamily:'ui-monospace, Menlo, monospace' }}>{sampleId}</div>
                <div className="nm" style={{ fontSize:'12px', fontWeight:600, marginTop:'2px' }}>{patient || '(no name)'}</div>
                <div className="meta" style={{ fontSize:'10px', marginTop:'1px', opacity:.8 }}>
                  PID {pid || '—'} · {test} · {tube}
                </div>
              </div>
              <span className="chip" style={{
                fontSize:'9px', padding:'2px 6px', borderRadius:'4px', color:'white',
                fontWeight:700, letterSpacing:'.5px', background: theme.chip,
              }}>{theme.name.toUpperCase()} · {priority.toUpperCase()}</span>
            </div>
            <div style={{ marginTop:'6px' }} dangerouslySetInnerHTML={{ __html: code.svg }} />
            <div style={{ fontSize:'11px', fontFamily:'ui-monospace, Menlo, monospace', textAlign:'center', marginTop:'2px' }}>{code.sanitized}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-600">
            Close
          </button>
          <button onClick={downloadSVG}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-700 text-slate-100 border border-slate-500 hover:bg-slate-600">
            Download SVG
          </button>
          <button onClick={printLabel}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-amber-950 hover:bg-amber-400">
            Print label
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">{label}</div>
      {children}
    </div>
  )
}
