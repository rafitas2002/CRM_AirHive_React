'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { getGoogleAuthUrl } from '@/lib/googleCalendarService'

type ConnectionStatus = {
    google: {
        connected: boolean
        email?: string
        lastSync?: string
    }
}

export default function CuentasPage() {
    const auth = useAuth()
    const [status, setStatus] = useState<ConnectionStatus>({
        google: { connected: false }
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        checkConnectionStatus()
    }, [])

    const checkConnectionStatus = async () => {
        if (!auth.user) return

        try {
            const supabase = createClient()
            const { data } = await supabase
                .from('google_connections')
                .select('*')
                .eq('user_id', auth.user.id)
                .single()

            if (data) {
                const conn = data as any
                setStatus({
                    google: {
                        connected: true,
                        email: conn.email || undefined,
                        lastSync: new Date(conn.updated_at).toLocaleDateString()
                    }
                })
            }
        } catch (error) {
            console.error('Error checking connection status:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleConnectGoogle = () => {
        const authUrl = getGoogleAuthUrl()
        window.location.href = authUrl
    }

    const handleDisconnectGoogle = async () => {
        if (!confirm('¿Estás seguro de desconectar tu cuenta de Google? Dejarán de sincronizarse las reuniones.')) return

        try {
            const supabase = createClient()
            const { error } = await supabase
                .from('google_connections')
                .delete()
                .eq('user_id', auth.user!.id)

            if (error) throw error

            setStatus({ google: { connected: false } })
        } catch (error) {
            console.error('Error deleting connection:', error)
            alert('Error al desconectar')
        }
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

                    {status.google.connected ? (
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
