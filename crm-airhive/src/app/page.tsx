'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function RootPage() {
  const router = useRouter()
  const auth = useAuth()

  useEffect(() => {
    router.replace(auth.loggedIn ? '/home' : '/login')
  }, [auth.loggedIn, router])

  return null
}
