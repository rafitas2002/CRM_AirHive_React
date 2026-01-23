'use client'

import TopBar from '@/components/TopBar'
import GlobalMeetingHandler from '@/components/GlobalMeetingHandler'
import { useAuth } from '@/lib/auth'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const auth = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!auth.loading && !auth.loggedIn) router.push('/login')
    }, [auth.loading, auth.loggedIn, router])

    if (auth.loading) {
        return (
            <div className='h-screen w-full flex items-center justify-center bg-[#F1F3F5]'>
                <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
            </div>
        )
    }

    if (!auth.loggedIn) return null

    return (
        <div className='h-screen flex flex-col bg-[#F1F3F5] overflow-hidden'>
            <TopBar />
            <main className='flex-1 overflow-hidden bg-[#E9ECEF]'>
                {children}
            </main>
        </div>
    )
}