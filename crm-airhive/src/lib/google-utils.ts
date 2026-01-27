import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!
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
        console.error('Error fetching google connection:', error)
        return null
    }

    // Check expiration (buffer of 5 mins)
    const expiresAt = new Date(data.expires_at).getTime()
    const now = Date.now()
    if (expiresAt - now > 5 * 60 * 1000) {
        return data.access_token
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
                refresh_token: data.refresh_token,
                grant_type: 'refresh_token',
            }),
        })

        const tokens = await response.json()

        if (!response.ok) {
            console.error('Refresh Error:', tokens)
            // If refresh fails (e.g. revoked), we might want to throw or return null
            throw new Error('Failed to refresh token: ' + (tokens.error_description || tokens.error))
        }

        // Update DB
        const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        const { error: updateError } = await supabase
            .from('google_integrations')
            .update({
                access_token: tokens.access_token,
                expires_at: newExpiresAt,
                updated_at: new Date().toISOString()
            })
            .eq('id', data.id)

        if (updateError) {
            console.error('Error updating refreshed token:', updateError)
        }

        return tokens.access_token
    } catch (err) {
        console.error('Token Refresh Exception:', err)
        throw err
    }
}
