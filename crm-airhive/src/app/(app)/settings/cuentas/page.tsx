'use client'

import { useState, useEffect } from 'react'
import { createClient, Database } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useRouter, useSearchParams } from 'next/navigation'

type ConnectionStatus = {
    google: {
        connected: boolean
        email?: string
        lastSync?: string
    }
}

type UserCalendarToken = Database['public']['Tables']['user_calendar_tokens']['Row']

export default function CuentasPage() {
    const auth = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()

    // Check for errors from callback
    const error = searchParams.get('error')
    const statusParam = searchParams.get('status')

    const [status, setStatus] = useState<ConnectionStatus>({
        google: { connected: false }
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (auth.loggedIn) {
            checkConnectionStatus()
        }
    }, [auth.loggedIn])

    useEffect(() => {
        if (statusParam === 'connected') {
            alert('¡Cuenta conectada exitosamente!')
            // clear params
            window.history.replaceState({}, '', '/settings/cuentas')
            checkConnectionStatus()
        } else if (error) {
            alert(`Error al conectar: ${error}`)
        }
    }, [statusParam, error])

    const checkConnectionStatus = async () => {
        if (!auth.user) return

        try {
            const supabase = createClient()
            const response = await supabase
                .from('user_calendar_tokens')
                .select('*')
                .eq('user_id', auth.user.id)
                .eq('provider', 'google')
                .single()

            // Explicit cast to avoid 'never' issue with build
            const data = response.data as UserCalendarToken | null

            if (data) {
                setStatus({
                    google: {
                        connected: true,
                        email: data.email || undefined,
                        lastSync: data.created_at ? new Date(data.created_at).toLocaleDateString() : undefined
                    }
                })
            } else {
                setStatus({ google: { connected: false } })
            }
        } catch (error) {
            console.error('Error checking connection status:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleConnectGoogle = () => {
        // Use the API route as callback to avoid mismatch errors and handle code on server
        // This MUST match the authorized URI in Google Console
        const redirectHere = typeof window !== 'undefined' ? `${window.location.origin}/api/auth/google/callback` : ''

        // Manual override of getGoogleAuthUrl to force this page as callback
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        const params = new URLSearchParams({
            client_id: clientId || '',
            redirect_uri: redirectHere,
            response_type: 'code',
            scope: [
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/calendar.events',
                'https://www.googleapis.com/auth/gmail.send',
                'openid',
                'email'
            ].join(' '),
            access_type: 'offline',
            prompt: 'select_account consent'
        })

        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    }

    const handleDisconnectGoogle = async () => {
        if (!confirm('¿Estás seguro de desconectar tu cuenta de Google? Dejarán de sincronizarse las reuniones.')) return

        try {
            const supabase = createClient()
            const { error } = await supabase
                .from('user_calendar_tokens')
                .delete()
                .eq('user_id', auth.user!.id)

            if (error) throw error

            setStatus({ google: { connected: false } })
        } catch (error) {
            console.error('Error deleting connection:', error)
            alert('Error al desconectar')
        }
    }

    if (loading) {
        return <div className="p-8">Cargando...</div>
    }

    return (
        <div className='p-8 max-w-5xl'>
            <div className='mb-8'>
                <h1 className='text-3xl font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
                    🔗 Conectar Cuentas
                </h1>
                <p className='text-base' style={{ color: 'var(--text-secondary)' }}>
                    Conecta tus cuentas externas para sincronizar calendarios, correos y más
                </p>
            </div>

            {/* Google Account Card */}
            <div className='space-y-6'>
                <div
                    className='p-6 rounded-xl border-2 transition-all'
                    style={{
                        background: 'var(--card-bg)',
                        borderColor: 'var(--card-border)'
                    }}
                >
                    <div className='flex items-start justify-between mb-4'>
                        <div className='flex items-center gap-4'>
                            <div className='w-14 h-14 rounded-full bg-white flex items-center justify-center text-3xl shadow-md'>
                                🔵
                            </div>
                            <div>
                                <h3 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
                                    Google Workspace
                                </h3>
                                <p className='text-sm mt-1' style={{ color: 'var(--text-secondary)' }}>
                                    Calendar, Gmail y más
                                </p>
                            </div>
                        </div>

                        {status.google.connected ? (
                            <span className='px-4 py-2 rounded-full text-sm font-semibold bg-green-100 text-green-700 border border-green-300'>
                                ✓ Conectado
                            </span>
                        ) : (
                            <span className='px-4 py-2 rounded-full text-sm font-semibold bg-gray-100 text-gray-600 border border-gray-300'>
                                ○ Desconectado
                            </span>
                        )}
                    </div>

                    <div className='mb-4'>
                        <h4 className='text-sm font-semibold mb-2' style={{ color: 'var(--text-primary)' }}>
                            Funcionalidades disponibles:
                        </h4>
                        <ul className='space-y-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
                            <li className='flex items-center gap-2'>
                                <span>📅</span>
                                Sincronización automática con Google Calendar
                            </li>
                            <li className='flex items-center gap-2'>
                                <span>📧</span>
                                Envío de invitaciones por Gmail
                            </li>
                            <li className='flex items-center gap-2'>
                                <span>🔔</span>
                                Notificaciones de eventos
                            </li>
                        </ul>
                    </div>

                    <div>
                        {status.google.connected ? (
                            <div className='flex items-center gap-4'>
                                <div className='text-sm text-gray-500'>
                                    {status.google.email && `Conectado como: ${status.google.email}`}
                                </div>
                                <button
                                    onClick={handleDisconnectGoogle}
                                    className='px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-bold text-sm'
                                >
                                    Desconectar
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleConnectGoogle}
                                className='px-6 py-2.5 bg-[#2048FF] text-white rounded-lg hover:bg-[#1700AC] transition-all shadow-md font-bold text-sm'
                            >
                                Conectar Cuenta de Google
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
