'use client'

/** Registers the service worker so the app is installable and works offline. */
import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      // Register after load so it never blocks first paint.
      const reg = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
      if (document.readyState === 'complete') reg()
      else window.addEventListener('load', reg, { once: true })
    }
  }, [])
  return null
}
