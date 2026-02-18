'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getAdminCorrelationData } from '@/app/actions/admin'
import PostponeForecastWindow from '@/components/insights/PostponeForecastWindow'

export default function InsightsPronosticoPage() {
    const auth = useAuth()
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)

    const fetchAnalytics = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            const res = await getAdminCorrelationData()
            if (res.success && res.data && !Array.isArray(res.data)) {
                setRows(res.data.analytics?.postponeByCompanySize || [])
            } else if (!res.success) {
                setError(res.error || 'No se pudo cargar el pronóstico de comportamiento')
            }
        } catch (err: any) {
            setError(err?.message || 'Respuesta inesperada del servidor al cargar pronóstico')
            setRows([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!auth.loading && !auth.loggedIn) {
            router.push('/home')
            return
        }
        if (auth.profile && auth.profile.role !== 'admin') {
            router.push('/home')
            return
        }
        void fetchAnalytics()
    }, [auth.loading, auth.loggedIn, auth.profile, router, fetchAnalytics])

    if (loading || auth.loading) {
        return <div className='h-full flex items-center justify-center font-bold' style={{ color: 'var(--text-secondary)' }}>Cargando pronóstico...</div>
    }

    return (
        <div className='min-h-full p-8'>
            <div className='max-w-6xl mx-auto space-y-4'>
                <div>
                    <h1 className='text-3xl font-black' style={{ color: 'var(--text-primary)' }}>Insights: Pronóstico de Juntas</h1>
                    <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>Ventana dedicada al riesgo de posposición/cancelación.</p>
                </div>
                {error ? (
                    <div className='rounded-2xl border p-4 font-bold text-sm' style={{ borderColor: '#ef4444', color: '#ef4444' }}>{error}</div>
                ) : (
                    <PostponeForecastWindow rows={rows} />
                )}
            </div>
        </div>
    )
}
