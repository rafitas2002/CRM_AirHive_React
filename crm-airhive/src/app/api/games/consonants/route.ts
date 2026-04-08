import { NextRequest, NextResponse } from 'next/server'
import {
    getCatalogByConsonants,
    getChallengeByConsonants,
    getRandomConsonantChallenge,
    validateConsonantWord
} from '@/lib/consonantWordGameServer'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const action = String(searchParams.get('action') || 'challenge').trim().toLowerCase()

        if (action === 'catalog') {
            const consonants = String(searchParams.get('consonants') || '')
            const catalog = getCatalogByConsonants(consonants)
            if (!catalog) {
                return NextResponse.json(
                    { ok: false, message: 'No existe catalogo para esas consonantes.' },
                    { status: 404 }
                )
            }
            return NextResponse.json({ ok: true, ...catalog })
        }

        const requestedConsonants = String(searchParams.get('consonants') || '')
        if (requestedConsonants) {
            const exactChallenge = getChallengeByConsonants(requestedConsonants)
            if (!exactChallenge) {
                return NextResponse.json(
                    { ok: false, message: 'Consonantes no disponibles.' },
                    { status: 404 }
                )
            }
            return NextResponse.json({ ok: true, challenge: exactChallenge })
        }

        const exclude = String(searchParams.get('exclude') || '')
        const challenge = getRandomConsonantChallenge(exclude)
        return NextResponse.json({ ok: true, challenge })
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                message: error instanceof Error
                    ? `Error al cargar reto: ${error.message}`
                    : 'Error inesperado al cargar el reto.'
            },
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}))
        const consonants = String(body?.consonants || '')
        const word = String(body?.word || '')
        const validation = validateConsonantWord({ consonants, rawWord: word })
        return NextResponse.json({ ok: true, ...validation })
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                message: error instanceof Error
                    ? `Error al validar palabra: ${error.message}`
                    : 'Error inesperado al validar palabra.'
            },
            { status: 500 }
        )
    }
}
