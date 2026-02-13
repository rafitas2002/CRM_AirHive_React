import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import EmployeesClient from './EmployeesClient'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

export const metadata = {
    title: 'Equipo - CRM Air Hive'
}

export default async function EmployeesPage() {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // 1. Verify Authentication & Role
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    const userProfile = profile as any

    if (!userProfile || (userProfile.role !== 'admin' && userProfile.role !== 'rh')) {
        redirect('/home')
    }

    // 2. Fetch Employees (Profiles) & Details
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

    if (profilesError) console.error('Error fetching profiles:', profilesError)

    const { data: details, error: detailsError } = await supabase
        .from('employee_profiles')
        .select('*')

    if (detailsError) {
        // It's possible the table doesn't exist yet if user didn't run SQL.
        // We should handle that gracefully or specific error.
        console.error('Error fetching details:', detailsError)
    }

    // Merge details into profiles
    const employees = ((profiles as any[]) || []).map(p => {
        const detail = (details || []).find((d: any) => d.user_id === p.id)
        return {
            ...p,
            details: detail || {} // Attach details or empty object
        }
    })

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'var(--background)' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                <EmployeesClient
                    initialEmployees={employees || []}
                    currentUserRole={userProfile?.role}
                />
            </div>
            <RichardDawkinsFooter />
        </div>
    )
}
