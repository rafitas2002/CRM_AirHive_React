import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

const AGENT_API_KEY = process.env.AGENT_API_KEY

export async function POST(request: Request) {
    const apiKey = request.headers.get('x-api-key')

    if (!AGENT_API_KEY || apiKey !== AGENT_API_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { lead_id, titulo, descripcion, fecha_vencimiento, prioridad, vendedor_id } = body

        if (!lead_id || !titulo || !fecha_vencimiento) {
            return NextResponse.json({ error: 'Missing required fields: lead_id, titulo, fecha_vencimiento' }, { status: 400 })
        }

        const supabase = createAdminClient()

        const { data, error } = await (supabase
            .from('tareas') as any)
            .insert([{
                lead_id,
                titulo,
                descripcion,
                fecha_vencimiento,
                prioridad: prioridad || 'media',
                estado: 'pendiente',
                vendedor_id
            }])
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, task: data })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
