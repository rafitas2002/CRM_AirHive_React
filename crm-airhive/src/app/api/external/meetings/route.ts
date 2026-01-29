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
        const { lead_id, seller_id, title, start_time, duration_minutes, meeting_type, notes } = body

        if (!lead_id || !seller_id || !title || !start_time) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // 1. Create the meeting
        const { data: meeting, error: meetingError } = await (supabase
            .from('meetings') as any)
            .insert([{
                lead_id,
                seller_id,
                title,
                start_time,
                duration_minutes: duration_minutes || 60,
                meeting_type: meeting_type || 'llamada',
                notes,
                status: 'scheduled',
                meeting_status: 'scheduled'
            }])
            .select()
            .single()

        if (meetingError) {
            return NextResponse.json({ error: meetingError.message }, { status: 500 })
        }

        // 2. Update lead's next_meeting_id (Manual sync as done in meetingsService)
        // Find the absolute next meeting for this lead
        const now = new Date().toISOString()
        const { data: nextMeeting } = await (supabase
            .from('meetings') as any)
            .select('id')
            .eq('lead_id', lead_id)
            .eq('status', 'scheduled')
            .gt('start_time', now)
            .order('start_time', { ascending: true })
            .limit(1)
            .single()

        await (supabase
            .from('clientes') as any)
            .update({
                next_meeting_id: nextMeeting?.id || null,
                probability_locked: false // Ensure it's unlocked so user can adjust before meeting
            })
            .eq('id', lead_id)

        return NextResponse.json({ success: true, meeting })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
