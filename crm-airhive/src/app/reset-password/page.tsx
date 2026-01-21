'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

export default function ResetPasswordPage() {
    const auth = useAuth()
    const router = useRouter()
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        // En Next.js, cuando vienes de un link de Supabase, 
        // la sesión ya debería estar activa si el hash se procesó.
        // Supabase-js maneja el hash automáticamente en onAuthStateChange o getSession.
    }, [])

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        auth.clearError()

        if (password.length < 6) {
            alert('La contraseña debe tener al menos 6 caracteres')
            return
        }

        if (password !== confirmPassword) {
            alert('Las contraseñas no coinciden')
            return
        }

        const ok = await auth.updatePassword(password)
        if (ok) {
            setSuccess(true)
            setTimeout(() => {
                router.push('/login')
            }, 3000)
        }
    }

    return (
        <div className='min-h-screen relative overflow-hidden'>
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
                            {!success ? (
                                <>
                                    <h1 className='text-[28px] font-extrabold text-black text-center'>Nueva contraseña</h1>
                                    <p className='mt-2 text-[13px] text-[#667085] text-center'>
                                        Crea una contraseña segura para tu cuenta.
                                    </p>

                                    <form className='mt-6 space-y-4' onSubmit={onSubmit}>
                                        <div className='space-y-1'>
                                            <label className='text-xs font-bold text-gray-500 uppercase ml-1'>Nueva Contraseña</label>
                                            <input
                                                className='w-full rounded-[10px] bg-[#F3F4F6] px-4 py-3 text-sm text-black outline-none border border-transparent focus:border-[#2048FF]'
                                                placeholder='••••••••'
                                                type='password'
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                            />
                                        </div>

                                        <div className='space-y-1'>
                                            <label className='text-xs font-bold text-gray-500 uppercase ml-1'>Confirmar Contraseña</label>
                                            <input
                                                className='w-full rounded-[10px] bg-[#F3F4F6] px-4 py-3 text-sm text-black outline-none border border-transparent focus:border-[#2048FF]'
                                                placeholder='••••••••'
                                                type='password'
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                required
                                            />
                                        </div>

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
                                            {auth.busy ? 'Actualizando...' : 'Cambiar contraseña'}
                                        </button>
                                    </form>
                                </>
                            ) : (
                                <div className='text-center py-4'>
                                    <div className='w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                                        <span className='text-2xl'>✅</span>
                                    </div>
                                    <h2 className='text-2xl font-bold text-black'>¡Éxito!</h2>
                                    <p className='mt-3 text-[14px] text-[#667085] leading-relaxed'>
                                        Tu contraseña ha sido actualizada correctamente.
                                        Redirigiendo al inicio de sesión...
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
