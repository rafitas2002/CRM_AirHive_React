'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function SettingsPage() {
    const router = useRouter()

    useEffect(() => {
        // Redirect to personalizacion by default
        router.replace('/settings/personalizacion')
    }, [router])

    return null
}
