'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import Image from 'next/image'
import Link from 'next/link'
import VisualIdentityBackground from '@/components/VisualIdentityBackground'

export default function LoginPage() {
    const auth = useAuth()

    const [username, setUsername] = useState('')
    const [pass, setPass] = useState('')

    useEffect(() => {
        // Opción: si entras a /login ya logeado, el middleware redirige, 
        // pero por si acaso el cliente también puede manejarlo.
        if (auth.loggedIn) {
            // Ya está manejado por middleware o router.push en auth, 
            // pero podemos forzar redirect si se quiere.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        auth.clearError()

        const u = username.trim()
        const p = pass

        if (!u || !p) return
        await auth.login(u, p)
        setPass('')
    }

    return (
        <div className='min-h-screen relative overflow-hidden'>
            {/* Fondo gradient igual a QML */}
            <div
                className='absolute inset-0'
                style={{
                    background: 'linear-gradient(180deg, #0F2A44 0%, #1700AC 55%, #6941E2 100%)'
                }}
            />
            {/* Visual identity decorative tubes on margins */}
            <VisualIdentityBackground />
            <div className='absolute inset-0 bg-white/10' />

            {/* Card */}
            <div className='relative min-h-screen flex items-center justify-center px-4'>
                <div className='w-full max-w-[520px]'>
                    <div className='rounded-[18px] bg-white border border-black/10 shadow-[0_12px_30px_rgba(0,0,0,0.25)] overflow-hidden'>
                        {/* header sutil */}
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
                            <h1 className='text-[28px] font-extrabold text-black text-center'>Iniciar sesión</h1>
                            <p className='mt-2 text-[13px] text-[#667085] text-center'>
                                Accede con tu usuario de Air Hive
                            </p>

                            <form className='mt-6 space-y-4' onSubmit={onSubmit}>
                                <input
                                    className='w-full rounded-[10px] bg-[#F3F4F6] px-4 py-3 text-sm text-black outline-none border border-transparent focus:border-[#2048FF]'
                                    placeholder='Usuario'
                                    type='text'
                                    value={username}
                                    onChange={(e) => {
                                        auth.clearError()
                                        setUsername(e.target.value)
                                    }}
                                    autoComplete='username'
                                />

                                <input
                                    className='w-full rounded-[10px] bg-[#F3F4F6] px-4 py-3 text-sm text-black outline-none border border-transparent focus:border-[#2048FF]'
                                    placeholder='Contraseña'
                                    type='password'
                                    value={pass}
                                    onChange={(e) => {
                                        auth.clearError()
                                        setPass(e.target.value)
                                    }}
                                    autoComplete='current-password'
                                />

                                <div className='flex justify-end'>
                                    <Link
                                        href='/forgot-password'
                                        className='text-[13px] text-[#2048FF] hover:underline font-medium'
                                    >
                                        ¿Olvidaste tu contraseña?
                                    </Link>
                                </div>

                                {/* Error box igual a QML */}
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
                                    {auth.busy ? 'Entrando...' : 'Entrar'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
