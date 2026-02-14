import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import UsersClient from './UsersClient'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

export const metadata = {
    title: 'Equipo - CRM Air Hive'
}

export default async function UsuariosPage() {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // 1. Verify Authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // 2. Fetch Employees (Profiles) & Details
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true })

    if (profilesError) console.error('Error fetching profiles:', profilesError)

    const { data: details, error: detailsError } = await supabase
        .from('employee_profiles')
        .select('*')

    if (detailsError) console.error('Error fetching details:', detailsError)

    // Merge details into profiles
    const employees = ((profiles as any[]) || []).map(p => {
        const detail = (details || []).find((d: any) => d.user_id === p.id)
        return {
            ...p,
            details: detail || {}
        }
    })

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'var(--background)' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                <UsersClient
                    initialUsers={employees || []}
                />
            </div>
            <RichardDawkinsFooter />
        </div>
    )
}
