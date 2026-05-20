'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // If already logged in, land on dashboard
    if (typeof document !== 'undefined') {
      const token = document.cookie
        .split('; ')
        .find((r) => r.startsWith('access_token='))
      if (token) router.replace('/dashboard')
    }
  }, [router])

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black font-sans">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            JORINOVA NEXUS
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            ALIS-X — Offline-first hybrid AI laboratory & patient management system
          </p>
          <a
            href="/login"
            className="rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-6 py-2.5 transition-colors"
          >
            Sign in
          </a>
        </div>
      </main>
    </div>
  )
}
