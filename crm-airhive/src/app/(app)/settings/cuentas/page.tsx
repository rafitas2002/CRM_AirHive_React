'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getGoogleAuthUrl, getGoogleConnectionStatus, disconnectGoogle } from '@/app/actions/google-integration'

type ConnectionStatus = {
    connected: boolean
    email?: string
    connectedAt?: string
}

export default function CuentasPage() {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Check for errors from callback
    const error = searchParams.get('google_error') || searchParams.get('error')
    const statusParam = searchParams.get('status')

    const [status, setStatus] = useState<ConnectionStatus>({ connected: false })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        checkStatus()
    }, [])

    useEffect(() => {
        if (statusParam === 'connected') {
            // Clear params
            router.replace('/settings/cuentas')
            checkStatus()
        } else if (error) {
            alert(`Error al conectar con Google: ${error}`)
        }
    }, [statusParam, error, router])

    const checkStatus = async () => {
        try {
            const data = await getGoogleConnectionStatus()
            if (data) {
                setStatus({
                    connected: true,
                    email: data.email,
                    connectedAt: data.connectedAt
                })
            } else {
                setStatus({ connected: false })
            }
        } catch (err) {
            console.error('Error checking status:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleConnectGoogle = async () => {
        try {
            const url = await getGoogleAuthUrl()
            window.location.href = url
        } catch (err) {
            console.error('Error getting auth url:', err)
            alert('Error al iniciar conexión')
        }
    }

    const handleDisconnectGoogle = async () => {
        if (!confirm('¿Estás seguro de desconectar tu cuenta de Google? Dejarán de sincronizarse las reuniones.')) return

        setLoading(true)
        try {
            const result = await disconnectGoogle()
            if (result.success) {
                setStatus({ connected: false })
            } else {
                alert('Error al desconectar: ' + result.error)
            }
        } catch (error) {
            console.error('Error deleting connection:', error)
            alert('Error al desconectar')
        } finally {
            setLoading(false)
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

                        {status.connected ? (
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
                        {status.connected ? (
                            <div className='flex items-center gap-4'>
                                <div className='text-sm text-gray-500'>
                                    {status.email && `Conectado como: ${status.email}`}
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
