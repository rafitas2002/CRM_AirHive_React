'use client'

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from './supabase'
import { User } from '@supabase/supabase-js'
import { trackEvent } from '@/app/actions/events'

type Profile = {
    id: string
    username: string | null
    role: string | null
    full_name: string | null
    created_at: string
    updated_at: string | null
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
    const latestUserIdRef = useRef<string | null>(null)

    const clearError = () => setLastError('')

    useEffect(() => {
        latestUserIdRef.current = user?.id || null
    }, [user?.id])

    // Initial session check
    useEffect(() => {
        const init = async () => {
            try {
                // Check if there is a 'code' in the URL (PKCE flow)
                // Check if there is a 'code' in the URL (PKCE flow)
                const url = new URL(window.location.href)
                const code = url.searchParams.get('code')

                // Detect if it's a special auth flow
                const isRecovery = window.location.hash.includes('type=recovery') || url.searchParams.get('type') === 'recovery'
                const isSignup = window.location.hash.includes('type=signup') || url.searchParams.get('type') === 'signup'
                const isInvite = window.location.hash.includes('type=invite') || url.searchParams.get('type') === 'invite'

                if (code) {
                    await supabase.auth.exchangeCodeForSession(code)
                    // Remove code from URL for cleanliness
                    url.searchParams.delete('code')
                    window.history.replaceState({}, '', url.toString())

                    if (isRecovery || isSignup || isInvite) {
                        router.push('/reset-password')
                        return
                    }
                }

                const sessionPromise = supabase.auth.getSession()
                const { data: { session }, error: sessionError } = await Promise.race([
                    sessionPromise,
                    new Promise<any>(resolve => setTimeout(() => resolve({ data: { session: null }, error: { message: 'Timeout' } }), 5000))
                ])

                if (session?.user) {
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

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                const currentUserId = latestUserIdRef.current
                const incomingUserId = session.user.id
                const isNewSessionUser = currentUserId !== incomingUserId
                const shouldHydrateProfile = event === 'SIGNED_IN' || event === 'USER_UPDATED' || isNewSessionUser

                if (shouldHydrateProfile) {
                    if (!currentUserId) setLoading(true)
                    await handleUserSession(session.user)
                } else if (!currentUserId) {
                    setUser(session.user)
                    setLoading(false)
                }
            } else {
                setUser(null)
                setProfile(null)
                latestUserIdRef.current = null
                setLoading(false)
            }
        })

        return () => subscription.unsubscribe()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleUserSession = async (authUser: User) => {
        setUser(authUser)

        // 1. Instant Cache Check
        const cacheKey = `airhive_profile_${authUser.id}`
        const cached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null

        if (cached) {
            try {
                const parsed = JSON.parse(cached)
                setProfile(parsed)
                setLoading(false) // UNLOCK UI IMMEDIATELY
            } catch (e) {
                console.warn('Failed to parse cached profile')
            }
        }

        try {
            // 2. Background Revalidation with Timeout
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
                if (typeof window !== 'undefined') {
                    localStorage.setItem(cacheKey, JSON.stringify(data))
                }
            } else if (error) {
                console.warn('Error fetching profile (or timeout):', error)
            }
        } catch (err) {
            console.error('Unexpected error fetching profile:', err)
        } finally {
            setLoading(false)
            // Session_start is tracked in EventTracker to avoid duplicate events/noise.
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

        console.log('Attempting login with email:', email)

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
        // Track login
        trackEvent({
            eventType: 'login',
            metadata: { username: usernameInput }
        })
        window.location.href = '/home'
    }

    const logout = async () => {
        setBusy(true)
        const currentUserId = user?.id
        try {
            await Promise.race([
                supabase.auth.signOut(),
                new Promise(resolve => setTimeout(resolve, 2000))
            ])
        } catch (err) {
            console.error('Unexpected error signing out:', err)
        }

        // Track logout
        if (currentUserId) {
            trackEvent({
                eventType: 'logout',
                userId: currentUserId
            })
        }

        // Clear cache
        if (typeof window !== 'undefined' && user) {
            localStorage.removeItem(`airhive_profile_${user.id}`)
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

        console.log('Attempting password reset for email:', email)

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
