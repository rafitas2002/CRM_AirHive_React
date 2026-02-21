import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!

export async function getValidAccessToken(userId: string) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Get tokens
    const { data, error } = await supabase
        .from('google_integrations')
        .select('*')
        .eq('user_id', userId)
        .single()

    if (error || !data) {
        const code = String((error as { code?: string } | null)?.code || '')
        // No active Google integration for this user.
        if (code !== 'PGRST116') {
            console.error('Error fetching google connection:', error)
        }
        return null
    }

    // Check expiration (buffer of 5 mins)
    const integrationData = data as any
    const expiresAt = new Date(integrationData.expires_at).getTime()
    const now = Date.now()
    if (expiresAt - now > 5 * 60 * 1000) {
        return integrationData.access_token
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        console.warn('Google OAuth env vars missing; skipping token refresh.')
        return null
    }

    console.log('Refreshing Google Token for user:', userId)

    // Refresh
    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                refresh_token: integrationData.refresh_token,
                grant_type: 'refresh_token',
            }),
        })

        const tokens = await response.json()

        if (!response.ok) {
            const oauthError = String(tokens?.error || '')
            const oauthDescription = String(tokens?.error_description || '')
            const shouldDisconnect = oauthError === 'invalid_client' || oauthError === 'invalid_grant'

            console.error('Refresh Error:', {
                error: oauthError || 'unknown',
                error_description: oauthDescription || 'unknown'
            })

            if (shouldDisconnect) {
                console.warn(`Disconnecting invalid Google integration for user ${userId} due to OAuth error: ${oauthError}`)
                await supabase
                    .from('google_integrations')
                    .delete()
                    .eq('id', integrationData.id)
                return null
            }

            return null
        }

        // Update DB
        const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        const { error: updateError } = await (supabase
            .from('google_integrations') as any)
            .update({
                access_token: tokens.access_token,
                expires_at: newExpiresAt,
                updated_at: new Date().toISOString()
            })
            .eq('id', integrationData.id)

        if (updateError) {
            console.error('Error updating refreshed token:', updateError)
        }

        return tokens.access_token
    } catch (err) {
        console.error('Token Refresh Exception:', err)
        return null
    }
}
