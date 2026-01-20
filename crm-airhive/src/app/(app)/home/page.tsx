'use client'

import { useAuth } from '@/lib/auth'

export default function HomePage() {
    const auth = useAuth()

    return (
        <div className='h-full flex items-center justify-center bg-gray-50'>
            <h1 className='text-4xl font-extrabold text-black'>
                Bienvenido {auth.username ? auth.username : ''} 🥳🥳
            </h1>
        </div>
    )
}
