'use client'

import React, { createContext, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type AuthState = {
    loggedIn: boolean
    username: string
    busy: boolean
    lastError: string
    login: (username: string, password: string) => Promise<void>
    logout: () => void
    clearError: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()

    const [loggedIn, setLoggedIn] = useState(false)
    const [username, setUsername] = useState('')
    const [busy, setBusy] = useState(false)
    const [lastError, setLastError] = useState('')

    const clearError = () => setLastError('')

    const login = async (u: string, p: string) => {
        setBusy(true)
        setLastError('')

        const user = u.trim()
        setUsername(user)

        // ✅ Mock temporal para clonar Qt: luego lo conectamos a Supabase real
        await new Promise(resolve => setTimeout(resolve, 450))

        if (!user || !p || p.length < 2) {
            setLastError('Usuario y/o contraseña incorrectos')
            setBusy(false)
            return
        }

        setLoggedIn(true)
        setBusy(false)
        router.push('/home')
    }

    const logout = () => {
        setLoggedIn(false)
        setUsername('')
        setLastError('')
        router.push('/login')
    }

    const value = useMemo(() => ({
        loggedIn,
        username,
        busy,
        lastError,
        login,
        logout,
        clearError
    }), [loggedIn, username, busy, lastError])

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
    return ctx
}
