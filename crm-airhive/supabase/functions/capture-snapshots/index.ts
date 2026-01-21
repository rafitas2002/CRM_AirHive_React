// Supabase Edge Function: capture-snapshots
// This function runs every 5 minutes to capture forecast snapshots
// when meetings start

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface Meeting {
    id: string
    lead_id: number
    seller_id: string
    start_time: string
    status: string
}

interface Lead {
    id: number
    probabilidad: number | null
}

interface Snapshot {
    id: string
    lead_id: number
    meeting_id: string
}

serve(async (req) => {
    try {
        // Initialize Supabase client with service role key
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        const now = new Date()
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

        console.log(`[${now.toISOString()}] Checking for meetings that started...`)

        // Find meetings that started in the last 5 minutes
        const { data: recentMeetings, error: meetingsError } = await supabase
            .from('meetings')
            .select('*')
            .gte('start_time', fiveMinutesAgo.toISOString())
            .lte('start_time', now.toISOString())
            .eq('status', 'scheduled')

        if (meetingsError) {
            console.error('Error fetching meetings:', meetingsError)
            return new Response(
                JSON.stringify({ error: 'Failed to fetch meetings', details: meetingsError }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        if (!recentMeetings || recentMeetings.length === 0) {
            console.log('No recent meetings to process')
            return new Response(
                JSON.stringify({ message: 'No meetings to process', processed: 0 }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        }

        console.log(`Found ${recentMeetings.length} meetings to process`)

        let processed = 0
        let skipped = 0
        let errors = 0

        for (const meeting of recentMeetings as Meeting[]) {
            try {
                // Check if probability already frozen for this meeting
                const { data: existingMeeting } = await supabase
                    .from('meetings')
                    .select('frozen_probability_value, meeting_status')
                    .eq('id', meeting.id)
                    .single()

                if (existingMeeting?.frozen_probability_value !== null) {
                    console.log(`Probability already frozen for meeting ${meeting.id}`)
                    skipped++
                    continue
                }

                // Get lead data
                const { data: lead, error: leadError } = await supabase
                    .from('clientes')
                    .select('id, probabilidad')
                    .eq('id', meeting.lead_id)
                    .single()

                if (leadError || !lead) {
                    console.error(`Lead not found for meeting ${meeting.id}:`, leadError)
                    errors++
                    continue
                }

                // Freeze probability in meeting (don't create snapshot yet - wait for confirmation)
                const { error: freezeError } = await supabase
                    .from('meetings')
                    .update({
                        frozen_probability_value: (lead as Lead).probabilidad || 50,
                        meeting_status: 'pending_confirmation'
                    })
                    .eq('id', meeting.id)

                if (freezeError) {
                    console.error(`Error freezing probability for meeting ${meeting.id}:`, freezeError)
                    errors++
                    continue
                }

                console.log(`✅ Probability frozen for meeting ${meeting.id}: ${(lead as Lead).probabilidad}%`)

                // Lock probability on lead
                await supabase
                    .from('clientes')
                    .update({
                        probability_locked: true,
                        last_snapshot_at: meeting.start_time
                    })
                    .eq('id', meeting.lead_id)

                console.log(`🔒 Probability locked for lead ${meeting.lead_id}`)

                processed++
            } catch (error) {
                console.error(`Error processing meeting ${meeting.id}:`, error)
                errors++
            }
        }

        const summary = {
            timestamp: now.toISOString(),
            total_meetings: recentMeetings.length,
            processed,
            skipped,
            errors
        }

        console.log('Summary:', summary)

        return new Response(
            JSON.stringify(summary),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        console.error('Unexpected error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: String(error) }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
})
