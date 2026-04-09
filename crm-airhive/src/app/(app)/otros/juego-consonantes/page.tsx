'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ConsonantWordGameWindow from '@/components/ConsonantWordGameWindow'
import { useAuth } from '@/lib/auth'
import { canAccessMindLab } from '@/lib/mindLabAccess'

export default function JuegoConsonantesPage() {
    const auth = useAuth()
    const router = useRouter()
    const canSeeMindLab = canAccessMindLab({
        email: auth.user?.email,
        username: auth.profile?.username || auth.username,
        fullName: auth.profile?.full_name
    })

    useEffect(() => {
        if (!auth.loading && !canSeeMindLab) {
            router.replace('/home')
        }
    }, [auth.loading, canSeeMindLab, router])

    if (auth.loading || !canSeeMindLab) {
        return (
            <section className='min-h-full w-full px-6 py-8'>
                <div className='max-w-4xl mx-auto'>
                    <div className='rounded-[30px] border p-6 text-sm font-semibold' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-secondary)' }}>
                        Cargando modulo...
                    </div>
                </div>
            </section>
        )
    }

    return <ConsonantWordGameWindow />
}
