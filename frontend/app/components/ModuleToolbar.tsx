'use client'

/**
 * ModuleToolbar — floating action bar fixed to the bottom-right of every
 * authenticated page (mounted once in AppShell). Three actions, always one
 * tap away regardless of which module you're on:
 *
 *   🎙  Voice command (browser SpeechRecognition + fuzzy correction)
 *   📷  AI image interpretation (microscopy slide, gel, lab form, etc.)
 *   🏷️  Specimen label & barcode (Code39, dept-coloured)
 *
 * Each modal is lazy-mounted on open so the toolbar adds ~zero overhead
 * to pages that don't use it.
 */

import { useState } from 'react'
import VoiceMic from './VoiceMic'
import ImageUploadModal from './ImageUploadModal'
import LabelModal       from './LabelModal'
import QuickPatientBar  from './QuickPatientBar'
import { useT } from '../contexts/I18nProvider'

export default function ModuleToolbar() {
  const t = useT()
  const [showImage, setShowImage] = useState(false)
  const [showLabel, setShowLabel] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  return (
    <>
      {/* Fixed bottom-right cluster */}
      <div
        className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden"
        aria-label={t('toolbar.quick_tools')}
      >
        {/* Voice mic — has its own component with its own transcript display */}
        <div className="bg-slate-900/90 backdrop-blur rounded-2xl p-2 border border-slate-700/60 shadow-xl">
          <VoiceMic />
        </div>

        {/* Quick patient search — same workspace as the dashboard, on every page */}
        <button
          onClick={() => setShowSearch(true)}
          title="Quick patient search"
          className="inline-flex items-center justify-center h-11 w-11 rounded-full border border-sky-400/60 bg-sky-500/20 text-sky-100 hover:bg-sky-500/40 hover:scale-105 transition-all shadow-lg backdrop-blur"
          aria-label="Quick patient search"
        >
          <span className="text-xl">🔍</span>
        </button>

        {/* Image upload */}
        <button
          onClick={() => setShowImage(true)}
          title={t('toolbar.image')}
          className="inline-flex items-center justify-center h-11 w-11 rounded-full border border-emerald-400/60 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/40 hover:scale-105 transition-all shadow-lg backdrop-blur"
          aria-label={t('toolbar.image')}
        >
          <span className="text-xl">📷</span>
        </button>

        {/* Label / barcode */}
        <button
          onClick={() => setShowLabel(true)}
          title={t('toolbar.label')}
          className="inline-flex items-center justify-center h-11 w-11 rounded-full border border-amber-400/60 bg-amber-500/20 text-amber-100 hover:bg-amber-500/40 hover:scale-105 transition-all shadow-lg backdrop-blur"
          aria-label={t('toolbar.label')}
        >
          <span className="text-xl">🏷️</span>
        </button>
      </div>

      {showImage && <ImageUploadModal onClose={() => setShowImage(false)} />}
      {showLabel && <LabelModal       onClose={() => setShowLabel(false)} />}

      {/* Quick patient search overlay — reuses the dashboard workspace */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-16 print:hidden"
             onClick={() => setShowSearch(false)}>
          <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <QuickPatientBar onClose={() => setShowSearch(false)} />
          </div>
        </div>
      )}
    </>
  )
}
