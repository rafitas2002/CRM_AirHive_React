'use client'

import Link from 'next/link'
import { Brain, ArrowRight } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { canAccessMindLab } from '@/lib/mindLabAccess'

export default function OtrosPage() {
    const auth = useAuth()
    const canSeeMindLab = canAccessMindLab({
        email: auth.user?.email,
        username: auth.profile?.username || auth.username,
        fullName: auth.profile?.full_name
    })

    if (auth.loading) {
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

    if (!canSeeMindLab) {
        return (
            <section className='min-h-full w-full px-6 py-8'>
                <div className='max-w-4xl mx-auto'>
                    <div className='rounded-[30px] border p-6 md:p-8 shadow-sm space-y-3' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <h1 className='text-2xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                            Laboratorio Mental
                        </h1>
                        <p className='text-sm font-medium' style={{ color: 'var(--text-secondary)' }}>
                            Este modulo de prueba esta habilitado unicamente para el usuario de Jesus Gracia.
                        </p>
                        <Link
                            href='/home'
                            className='inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white bg-[#2048FF] hover:bg-[#1736c9] transition-colors'
                        >
                            Volver a Home
                        </Link>
                    </div>
                </div>
            </section>
        )
    }

    return (
        <section className='min-h-full w-full px-6 py-8'>
            <div className='max-w-4xl mx-auto space-y-6'>
                <header className='rounded-[30px] border p-6 md:p-8 shadow-sm' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <div className='flex items-start gap-4'>
                        <div className='ah-icon-card ah-icon-card-sm mt-1'>
                            <Brain size={20} strokeWidth={2} />
                        </div>
                        <div>
                            <h1 className='text-3xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                Laboratorio Mental
                            </h1>
                            <p className='mt-2 font-medium' style={{ color: 'var(--text-secondary)' }}>
                                Ejercicios cortos para activar la mente del equipo durante la jornada.
                            </p>
                        </div>
                    </div>
                </header>

                <article className='rounded-[30px] border p-6 md:p-8 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-6' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <div>
                        <p className='text-xs font-black uppercase tracking-[0.14em]' style={{ color: 'var(--text-secondary)' }}>
                            Piloto disponible
                        </p>
                        <h2 className='text-2xl font-black mt-2' style={{ color: 'var(--text-primary)' }}>
                            Consonantes en Orden
                        </h2>
                        <p className='text-sm mt-2 max-w-2xl' style={{ color: 'var(--text-secondary)' }}>
                            El sistema da tres consonantes y cada persona escribe palabras reconocidas en espanol que las contengan en ese orden.
                        </p>
                        <p className='text-xs mt-2 font-semibold uppercase tracking-[0.1em]' style={{ color: 'var(--text-secondary)', opacity: 0.9 }}>
                            Incluye modo tiempo y modo infinito persistente
                        </p>
                    </div>

                    <Link
                        href='/otros/juego-consonantes'
                        className='inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white bg-[#2048FF] hover:bg-[#1736c9] transition-colors'
                    >
                        Abrir juego
                        <ArrowRight size={14} />
                    </Link>
                </article>
            </div>
        </section>
    )
}
