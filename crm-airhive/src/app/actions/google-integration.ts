'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { getValidAccessToken } from '@/lib/google-utils'
import { sendGmailMessage } from '@/lib/gmailService'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
// Fallback for Vercel where it might be named without NEXT_PUBLIC
const GOOGLE_REDIRECT_URI = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI!

export async function getGoogleAuthUrl() {
    const scopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
        'openid'
    ]

    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: 'code',
        access_type: 'offline', // crucial for refresh token
        prompt: 'consent', // force consent to get refresh token
        scope: scopes.join(' ')
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCode(code: string) {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) throw new Error('Usuario no autenticado')

        // 1. Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: GOOGLE_REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        })

        const tokens = await tokenResponse.json()

        if (!tokenResponse.ok) {
            console.error('Google Token Error:', tokens)
            throw new Error(tokens.error_description || 'Error al obtener tokens de Google')
        }

        if (!tokens.refresh_token) {
            console.error('No refresh_token returned by Google', tokens)
            // Ideally we would revoke existing token to force consent next time, 
            // but for now let's just fail or if we are strict, we fail.
            // Since we use prompt=consent, it SHOULD be there.
            throw new Error('Google no devolvió un refresh_token. Por favor revoca el acceso en tu cuenta de Google y vuelve a intentar.')
        }

        // 2. Get User Info (Email)
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        })

        const googleUser = await userResponse.json()
        if (!userResponse.ok) throw new Error('Error al obtener info de usuario Google')

        // 3. Calculate expiration
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

        // 4. Save to Database
        const { error: dbError } = await supabase
            .from('google_integrations')
            .upsert({
                user_id: user.id,
                email: googleUser.email,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: expiresAt,
                scope: tokens.scope,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })

        if (dbError) {
            console.error('DB Save Error:', dbError)
            throw new Error('Error al guardar la integración en base de datos')
        }

        return { success: true }
    } catch (error: any) {
        console.error('Exchange Code Error:', error)
        return { success: false, error: error.message }
    }
}

export async function getGoogleConnectionStatus() {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
        .from('google_integrations')
        .select('email, created_at, expires_at')
        .eq('user_id', user.id)
        .single()

    if (error || !data) return null

    return {
        connected: true,
        email: data.email,
        connectedAt: data.created_at
    }
}

export async function disconnectGoogle() {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false }

    // Optional: Revoke token at Google
    // ...

    const { error } = await supabase
        .from('google_integrations')
        .delete()
        .eq('user_id', user.id)

    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function sendGoogleEmailAction(to: string, subject: string, body: string) {
    try {
        const cookieStore = await cookies()
        const supabase = createClient(cookieStore)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No autenticado')

        const accessToken = await getValidAccessToken(user.id)
        if (!accessToken) throw new Error('No se encontró conexión con Google')

        await sendGmailMessage(accessToken, to, subject, body)

        return { success: true }
    } catch (error: any) {
        console.error('Send Email Action Error:', error)
        return { success: false, error: error.message }
    }
}
