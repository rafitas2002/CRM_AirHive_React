'use client'

import { useAuth } from '@/lib/auth'

export default function HomePage() {
    const auth = useAuth()

    return (
        <div className='min-h-[calc(100vh-70px)] bg-gray-50 flex items-center justify-center'>
            <h1 className='text-4xl font-extrabold text-black'>
                Bienvenido {auth.username ? auth.username : ''} 🥳🥳
            </h1>
        </div>
    )
}
