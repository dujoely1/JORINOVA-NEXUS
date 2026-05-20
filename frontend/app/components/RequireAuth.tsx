'use client'

import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthProvider'

export default function RequireAuth({
  children,
  redirectTo = '/login',
}: {
  children: ReactNode
  redirectTo?: string
}) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.replace(redirectTo)
  }, [loading, user, redirectTo, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-zinc-500">
        Loading…
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}

