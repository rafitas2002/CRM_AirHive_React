'use client'

import TopBar from '@/components/TopBar'
import GlobalMeetingHandler from '@/components/GlobalMeetingHandler'
import EventTracker from '@/components/EventTracker'
import VisualIdentityBackground from '@/components/VisualIdentityBackground'
import { useAuth } from '@/lib/auth'
import { ThemeProvider } from '@/lib/ThemeContext'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const auth = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!auth.loading && !auth.loggedIn) router.push('/login')
    }, [auth.loading, auth.loggedIn, router])

    // Only show blocking spinner if we are loading AND don't have a session yet
    // If we have a session but are loading (e.g. refreshing profile), we show the app
    if (auth.loading && !auth.loggedIn) {
        return (
            <div className='h-screen w-full flex items-center justify-center bg-[#F1F3F5]'>
                <div className='w-12 h-12 border-4 border-[#2048FF] border-t-transparent rounded-full animate-spin' />
            </div>
        )
    }

    if (!auth.loggedIn) return null

    return (
        <ThemeProvider>
            <GlobalMeetingHandler />
            <EventTracker />
            <div className='h-screen flex flex-col relative overflow-hidden' style={{ background: 'transparent' }}>
                {/* Decorative background identity layer */}
                <VisualIdentityBackground />
                <TopBar />
                <main className='flex-1 overflow-auto relative z-10' style={{ background: 'transparent' }}>
                    {children}
                </main>
            </div>
        </ThemeProvider>
    )
}