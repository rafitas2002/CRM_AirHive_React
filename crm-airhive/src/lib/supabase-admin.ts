import { createClient } from '@supabase/supabase-js'
import { Database } from './supabase'

/**
 * Supabase Admin Client
 * WARNING: This client bypasses Row Level Security (RLS).
 * Only use in server-side routes that have proper API Key authentication.
 */
export const createAdminClient = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase Admin environment variables')
    }

    return createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
}
