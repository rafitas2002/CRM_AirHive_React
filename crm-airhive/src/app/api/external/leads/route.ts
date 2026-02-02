import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

const AGENT_API_KEY = process.env.AGENT_API_KEY

export async function POST(request: Request) {
    // 1. Authenticate with API Key
    const apiKey = request.headers.get('x-api-key')

    if (!AGENT_API_KEY || apiKey !== AGENT_API_KEY) {
        return NextResponse.json({ error: 'Unauthorized: Invalid or missing API Key' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { empresa, nombre, contacto, email, telefono, notas, owner_id } = body

        if (!nombre) {
            return NextResponse.json({ error: 'Bad Request: "nombre" is required' }, { status: 400 })
        }

        const supabase = createAdminClient()

        const { data, error } = await (supabase
            .from('clientes') as any)
            .insert([{
                empresa,
                nombre,
                contacto,
                email,
                telefono,
                notas,
                owner_id,
                etapa: 'Nuevo', // Default stage for new leads
                fecha_registro: new Date().toISOString(),
                probabilidad: 10 // Starting probability
            }])
            .select()
            .single()

        if (error) {
            console.error('API Lead Post Error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, lead: data })
    } catch (err: any) {
        console.error('API Lead Exception:', err)
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
    }
}
