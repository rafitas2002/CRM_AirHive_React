'use client'

import TopBar from '@/components/TopBar'
import { useAuth } from '@/lib/auth'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const auth = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!auth.loggedIn) router.push('/login')
    }, [auth.loggedIn, router])

    if (!auth.loggedIn) return null

    return (
        <div className='h-screen flex flex-col bg-gray-50 overflow-hidden'>
            <TopBar />
            <main className='flex-1 overflow-hidden bg-gray-100'>
                {children}
            </main>
        </div>
    )
}