import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { exchangeCodeForToken, storeUserTokens } from '@/lib/googleCalendarService'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const error = requestUrl.searchParams.get('error')

    if (error) {
        console.error('Google OAuth Error:', error)
        return NextResponse.redirect(new URL('/calendario?error=auth_denied', requestUrl.origin))
    }

    if (code) {
        try {
            const cookieStore = await cookies()
            const supabase = createServerClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                {
                    cookies: {
                        get(name: string) {
                            return cookieStore.get(name)?.value
                        },
                        set(name: string, value: string, options: CookieOptions) {
                            cookieStore.set({ name, value, ...options })
                        },
                        remove(name: string, options: CookieOptions) {
                            cookieStore.set({ name, value: '', ...options })
                        },
                    },
                }
            )
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                return NextResponse.redirect(new URL('/login', requestUrl.origin))
            }

            // Exchange code for tokens
            const tokens = await exchangeCodeForToken(code)

            // Store tokens in database
            await storeUserTokens(supabase, user.id, tokens)

            // Redirect back to calendar with success message
            return NextResponse.redirect(new URL('/calendario?success=google_connected', requestUrl.origin))
        } catch (err) {
            console.error('Error in Google OAuth callback:', err)
            return NextResponse.redirect(new URL('/calendario?error=connection_failed', requestUrl.origin))
        }
    }

    // No code and no error? Something went wrong
    return NextResponse.redirect(new URL('/calendario', requestUrl.origin))
}
