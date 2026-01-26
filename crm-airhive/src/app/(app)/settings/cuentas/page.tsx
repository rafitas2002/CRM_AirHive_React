'use client'

import { useState, useEffect } from 'react'
import { createClient, Database } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getGoogleAuthUrl, exchangeCodeForToken, storeUserTokens } from '@/lib/googleCalendarService'
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

    // Check for callback code
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    const [status, setStatus] = useState<ConnectionStatus>({
        google: { connected: false }
    })
    const [loading, setLoading] = useState(true)
    const [isConnecting, setIsConnecting] = useState(false)

    useEffect(() => {
        if (auth.loggedIn) {
            checkConnectionStatus()
        }
    }, [auth.loggedIn])

    // Handle OAuth Callback Client Side (Simpler and more reliable for SPA)
    useEffect(() => {
        if (code && auth.user && !isConnecting) {
            handleCallback(code)
        }
    }, [code, auth.user])

    const handleCallback = async (authCode: string) => {
        setIsConnecting(true)
        try {
            // Exchange code
            const redirectHere = `${window.location.origin}/settings/cuentas`
            const tokens = await exchangeCodeForToken(authCode, redirectHere)

            // Store locally in component to fix UI immediately
            const supabase = createClient()
            await storeUserTokens(supabase, auth.user!.id, tokens)

            // Clean URL
            window.history.replaceState({}, '', '/settings/cuentas')

            // Re-check status
            await checkConnectionStatus()
            alert('¡Cuenta conectada exitosamente!')
        } catch (error) {
            console.error('Error connecting Google:', error)
            alert('Hubo un error al conectar la cuenta. Por favor intenta de nuevo.')
        } finally {
            setIsConnecting(false)
        }
    }

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
        // Redirect to same page but with callback
        // We override the redirect URI to point here: /settings/cuentas
        const redirectHere = typeof window !== 'undefined' ? `${window.location.origin}/settings/cuentas` : ''

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

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-red-500 font-bold">Error en la conexión: {error}</p>
                <button onClick={() => window.location.href = '/settings/cuentas'} className="mt-4 text-blue-600 underline">Volver a intentar</button>
            </div>
        )
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

                    {isConnecting ? (
                        <div className="w-full py-4 text-center bg-blue-50 text-blue-600 rounded-lg font-bold animate-pulse">
                            Conectando con Google...
                        </div>
                    ) : status.google.connected ? (
                        <div className='space-y-3'>
                            <div className='p-3 rounded-lg' style={{ background: 'var(--hover-bg)' }}>
                                <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                                    <span className='font-semibold' style={{ color: 'var(--text-primary)' }}>Cuenta: </span>
                                    {status.google.email}
                                </p>
                            </div>
                            <button
                                onClick={handleDisconnectGoogle}
                                className='w-full px-6 py-3 rounded-lg font-semibold text-sm transition-all hover:scale-105'
                                style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none'
                                }}
                            >
                                Desconectar cuenta
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleConnectGoogle}
                            className='w-full px-6 py-3 rounded-lg font-semibold text-sm transition-all hover:scale-105'
                            style={{
                                background: '#2048FF',
                                color: 'white',
                                border: 'none'
                            }}
                        >
                            🔗 Conectar cuenta de Google
                        </button>
                    )}
                </div>

                {/* Info Card */}
                <div
                    className='p-4 rounded-lg border'
                    style={{
                        background: 'var(--card-bg)',
                        borderColor: 'var(--card-border)'
                    }}
                >
                    <p className='text-sm flex items-start gap-2' style={{ color: 'var(--text-secondary)' }}>
                        <span className='text-base'>💡</span>
                        <span>
                            Al conectar tu cuenta de Google, tus reuniones creadas en el CRM se sincronizarán automáticamente con Google Calendar y se enviarán invitaciones por correo a los asistentes.
                        </span>
                    </p>
                </div>
            </div>
        </div>
    )
}
