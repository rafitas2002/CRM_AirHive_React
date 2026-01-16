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
        <div className='min-h-screen bg-gray-50'>
            <TopBar />
            <div className='min-h-[calc(100vh-70px)] bg-gray-100'>
                {children}
            </div>
        </div>
    )
}