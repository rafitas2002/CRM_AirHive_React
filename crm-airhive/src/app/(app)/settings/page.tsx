'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function SettingsPage() {
    const router = useRouter()

    useEffect(() => {
        const fallback = '/settings/personalizacion'
        let target = fallback

        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('airhive_settings_last_subroute') || ''
                const isValidSettingsSubroute = (
                    saved.startsWith('/settings/')
                    && saved !== '/settings'
                )
                if (isValidSettingsSubroute) {
                    target = saved
                }
            } catch {
                // noop
            }
        }

        router.replace(target)
    }, [router])

    return null
}
