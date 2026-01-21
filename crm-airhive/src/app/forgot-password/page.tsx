'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import Image from 'next/image'
import Link from 'next/link'

export default function ForgotPasswordPage() {
    const auth = useAuth()
    const [identifier, setIdentifier] = useState('')
    const [sent, setSent] = useState(false)

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        auth.clearError()

        if (!identifier.trim()) return

        const success = await auth.requestPasswordReset(identifier.trim())
        if (success) {
            setSent(true)
        }
    }

    return (
        <div className='min-h-screen relative overflow-hidden'>
            {/* Fondo gradient igual a login */}
            <div
                className='absolute inset-0'
                style={{
                    background: 'linear-gradient(180deg, #0F2A44 0%, #1700AC 55%, #6941E2 100%)'
                }}
            />
            <div className='absolute inset-0 bg-white/10' />

            <div className='relative min-h-screen flex items-center justify-center px-4'>
                <div className='w-full max-w-[520px]'>
                    <div className='rounded-[18px] bg-white border border-black/10 shadow-[0_12px_30px_rgba(0,0,0,0.25)] overflow-hidden'>
                        <div className='h-[90px] bg-black/5 flex items-center justify-center'>
                            <Image
                                src='/airhive_logo_azul_sinfondo.svg'
                                alt='Air Hive'
                                width={325}
                                height={100}
                                priority
                            />
                        </div>

                        <div className='p-7'>
                            {!sent ? (
                                <>
                                    <h1 className='text-[28px] font-extrabold text-black text-center'>Recuperar contraseña</h1>
                                    <p className='mt-2 text-[13px] text-[#667085] text-center'>
                                        Ingresa tu usuario o correo electrónico de Air Hive para recibir un enlace de recuperación.
                                    </p>

                                    <form className='mt-6 space-y-4' onSubmit={onSubmit}>
                                        <input
                                            className='w-full rounded-[10px] bg-[#F3F4F6] px-4 py-3 text-sm text-black outline-none border border-transparent focus:border-[#2048FF]'
                                            placeholder='Usuario o Correo'
                                            type='text'
                                            value={identifier}
                                            onChange={(e) => {
                                                auth.clearError()
                                                setIdentifier(e.target.value)
                                            }}
                                            required
                                        />

                                        {auth.lastError ? (
                                            <div className='w-full rounded-[10px] bg-[#FFF1F1] border border-[#FFD1D1] px-3 py-2'>
                                                <p className='text-[13px] text-[#B42318]'>{auth.lastError}</p>
                                            </div>
                                        ) : null}

                                        <button
                                            type='submit'
                                            disabled={auth.busy}
                                            className={[
                                                'w-full h-[46px] rounded-[12px] font-bold text-sm text-white',
                                                auth.busy ? 'bg-[#AAB2D5]' : 'bg-[#2048FF]'
                                            ].join(' ')}
                                        >
                                            {auth.busy ? 'Enviando...' : 'Enviar enlace'}
                                        </button>

                                        <div className='text-center pt-2'>
                                            <Link href='/login' className='text-[13px] text-[#667085] hover:text-[#2048FF] font-medium'>
                                                Volver al inicio de sesión
                                            </Link>
                                        </div>
                                    </form>
                                </>
                            ) : (
                                <div className='text-center py-4'>
                                    <div className='w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                                        <span className='text-2xl'>✉️</span>
                                    </div>
                                    <h2 className='text-2xl font-bold text-black'>Correo enviado</h2>
                                    <p className='mt-3 text-[14px] text-[#667085] leading-relaxed'>
                                        Hemos enviado un enlace de recuperación a tu correo asociado.
                                        Por favor revisa tu bandeja de entrada y spam.
                                    </p>
                                    <div className='mt-8'>
                                        <Link
                                            href='/login'
                                            className='inline-block px-8 py-3 bg-[#2048FF] text-white rounded-[12px] font-bold text-sm shadow-md hover:bg-[#1700AC] transition-all'
                                        >
                                            Ir al Login
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
