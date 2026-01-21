'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from './supabase'
import { Session, User } from '@supabase/supabase-js'

type Profile = {
    id: string
    username: string | null
    role: string | null
    full_name: string | null
}

type AuthState = {
    loggedIn: boolean
    username: string
    profile: Profile | null
    loading: boolean
    busy: boolean
    lastError: string
    login: (username: string, password: string) => Promise<void>
    logout: () => Promise<void>
    requestPasswordReset: (emailOrUsername: string) => Promise<boolean>
    updatePassword: (newPassword: string) => Promise<boolean>
    clearError: () => void
    user: User | null
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true) // Initial loading state
    const [busy, setBusy] = useState(false) // Action busy state (login/logout)
    const [lastError, setLastError] = useState('')

    const clearError = () => setLastError('')

    // Initial session check
    useEffect(() => {
        const init = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (session?.user) {
                    // Don't block loading on profile fetch? 
                    // Better to block to avoid flicker, but with timeout.
                    await handleUserSession(session.user)
                } else {
                    setLoading(false)
                }
            } catch (error) {
                console.error('Error checking session:', error)
                setLoading(false)
            }
        }

        init()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
                if (session.user.id !== user?.id) {
                    setLoading(true)
                    await handleUserSession(session.user)
                }
            } else {
                setUser(null)
                setProfile(null)
                setLoading(false)
            }
        })

        return () => subscription.unsubscribe()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleUserSession = async (authUser: User) => {
        setUser(authUser)
        try {
            // Fetch profile with timeout
            const profilePromise = supabase
                .from('profiles')
                .select('*')
                .eq('id', authUser.id)
                .single()

            const { data, error } = await Promise.race([
                profilePromise,
                new Promise<any>(resolve => setTimeout(() => resolve({ error: { message: 'Timeout' } }), 5000))
            ])

            if (data) {
                setProfile(data)
            } else if (error) {
                console.warn('Error fetching profile (or timeout):', error)
            }
        } catch (err) {
            console.error('Unexpected error fetching profile:', err)
        } finally {
            setLoading(false)
        }
    }

    // Login... (remains mostly same, uses setBusy)
    const login = async (usernameInput: string, p: string) => {
        setBusy(true)
        setLastError('')

        const domain = process.env.NEXT_PUBLIC_AUTH_DOMAIN || 'airhivemx.com'
        const email = usernameInput.includes('@')
            ? usernameInput
            : `${usernameInput}@${domain}`

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: p
        })

        if (error) {
            console.error('Login error:', error)
            let msg = 'Error al iniciar sesión'
            if (error.message.includes('Invalid login credentials')) {
                msg = 'Usuario o contraseña incorrectos'
            } else if (error.message.includes('Email not confirmed')) {
                msg = 'Por favor verifica tu correo electrónico'
            } else {
                // Show raw error for debugging (e.g. missing env vars)
                const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'No definida'
                msg = `Error: ${error.message} (Intento conectar a: ${url})`
            }
            setLastError(msg)
            setBusy(false)
            return
        }

        setBusy(false)
        router.push('/')
    }

    const logout = async () => {
        setBusy(true) // Explicitly busy for action
        try {
            await Promise.race([
                supabase.auth.signOut(),
                new Promise(resolve => setTimeout(resolve, 2000))
            ])
        } catch (err) {
            console.error('Unexpected error signing out:', err)
        }

        setUser(null)
        setProfile(null)
        setBusy(false)

        window.location.href = '/login'
    }

    const requestPasswordReset = async (usernameInput: string) => {
        setBusy(true)
        setLastError('')
        const domain = process.env.NEXT_PUBLIC_AUTH_DOMAIN || 'airhivemx.com'
        const email = usernameInput.includes('@')
            ? usernameInput
            : `${usernameInput}@${domain}`

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        })

        setBusy(false)
        if (error) {
            console.error('Reset error:', error)
            setLastError(error.message)
            return false
        }
        return true
    }

    const updatePassword = async (newPassword: string) => {
        setBusy(true)
        setLastError('')
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        })

        setBusy(false)
        if (error) {
            console.error('Update password error:', error)
            setLastError(error.message)
            return false
        }
        return true
    }

    const value = useMemo(() => ({
        loggedIn: !!user,
        username: profile?.username || user?.email || '',
        profile,
        loading,
        busy,
        lastError,
        login,
        logout,
        requestPasswordReset,
        updatePassword,
        clearError,
        user
    }), [user, profile, loading, busy, lastError])

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
    return ctx
}
