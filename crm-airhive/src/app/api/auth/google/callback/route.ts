import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokenAction } from '@/app/actions/google-calendar'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    const redirectUrl = new URL('/settings/cuentas', request.url)

    if (error) {
        redirectUrl.searchParams.set('error', error)
        return NextResponse.redirect(redirectUrl)
    }

    if (!code) {
        redirectUrl.searchParams.set('error', 'no_code')
        return NextResponse.redirect(redirectUrl)
    }

    // Construct the exactly matching redirect URI for verification
    const callbackUrl = `${request.nextUrl.origin}${request.nextUrl.pathname}`

    try {
        const result = await exchangeCodeForTokenAction(code, callbackUrl)

        if (result.success) {
            redirectUrl.searchParams.set('status', 'connected')
        } else {
            console.error('Callback Exchange Error:', result.error)
            redirectUrl.searchParams.set('error', result.error || 'exchange_failed')
        }
    } catch (err: any) {
        console.error('Callback Route Error:', err)
        redirectUrl.searchParams.set('error', err.message || 'unknown_error')
    }

    return NextResponse.redirect(redirectUrl)
}
