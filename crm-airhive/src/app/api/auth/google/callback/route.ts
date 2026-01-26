
import { createClient } from '@/lib/supabase'
import { exchangeCodeForToken, storeUserTokens } from '@/lib/googleCalendarService'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
        return NextResponse.redirect(new URL('/settings/cuentas?error=' + error, request.url))
    }

    if (!code) {
        return NextResponse.redirect(new URL('/settings/cuentas?error=no_code', request.url))
    }

    try {
        const cookieStore = cookies()
        const supabase = createClient()

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.redirect(new URL('/login', request.url))
        }

        // Exchange code for tokens
        const tokens = await exchangeCodeForToken(code)

        // Store tokens
        await storeUserTokens(supabase, user.id, tokens)

        return NextResponse.redirect(new URL('/settings/cuentas?success=true', request.url))
    } catch (err: any) {
        console.error('Error in Google Callback:', err)
        return NextResponse.redirect(new URL('/settings/cuentas?error=' + encodeURIComponent(err.message), request.url))
    }
}
