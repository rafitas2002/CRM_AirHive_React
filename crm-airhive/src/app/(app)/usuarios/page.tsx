import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import UsersClient from './UsersClient'
import RichardDawkinsFooter from '@/components/RichardDawkinsFooter'

const BADGE_GRANT_ALLOWED_ADMINS = new Set([
    'Jesus Gracia',
    'Rafael Sedas',
    'Eduardo Castro',
    'Alberto Castro'
])

export const metadata = {
    title: 'Equipo - CRM Air Hive'
}

export default async function UsuariosPage() {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // 1. Verify Authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: viewerProfile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle()

    const viewerIsAdmin = (viewerProfile as any)?.role === 'admin'
    const dbClient = (() => {
        try {
            return createAdminClient()
        } catch {
            return supabase
        }
    })()

    // 2. Fetch Employees (Profiles) & Details
    const { data: profiles, error: profilesError } = await dbClient
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true })

    if (profilesError) console.error('Error fetching profiles:', profilesError)

    const { data: details, error: detailsError } = await dbClient
        .from('employee_profiles')
        .select('*')

    if (detailsError) console.error('Error fetching details:', detailsError)

    const { data: industryBadges, error: industryBadgesError } = await dbClient
        .from('seller_industry_badges')
        .select('seller_id, industria_id, closures_count, level, updated_at, industrias(name)')
        .gt('level', 0)

    if (industryBadgesError) console.error('Error fetching industry badges:', industryBadgesError)

    const { data: specialBadges, error: specialBadgesError } = await dbClient
        .from('seller_special_badges')
        .select('seller_id, badge_type, badge_key, badge_label, progress_count, level, updated_at')
        .gt('level', 0)

    if (specialBadgesError) console.error('Error fetching special badges:', specialBadgesError)

    const { data: adminBadgeGrants, error: adminBadgeGrantsError } = await dbClient
        .from('admin_badge_grants')
        .select('admin_id, badge_type')
        .eq('badge_type', 'admin_granted')

    const adminBadgeGrantsQueryFailed = Boolean(adminBadgeGrantsError)
    const adminBadgeGrantsErrorCode = String((adminBadgeGrantsError as any)?.code || '')
    const adminBadgeGrantsErrorMessage = String((adminBadgeGrantsError as any)?.message || '')
    const shouldIgnoreAdminBadgeGrantsError =
        adminBadgeGrantsQueryFailed && (
            adminBadgeGrantsErrorCode === '42P01' || // relation does not exist
            adminBadgeGrantsErrorCode === 'PGRST205' || // table not found in schema cache
            /admin_badge_grants/i.test(adminBadgeGrantsErrorMessage)
        )

    if (adminBadgeGrantsError && !shouldIgnoreAdminBadgeGrantsError) {
        console.error('Error fetching admin badge grants:', {
            code: (adminBadgeGrantsError as any)?.code || null,
            message: (adminBadgeGrantsError as any)?.message || null,
            details: (adminBadgeGrantsError as any)?.details || null,
            hint: (adminBadgeGrantsError as any)?.hint || null
        })
    }

    // Merge details into profiles
    const sanitizeEmployeeDetailsForSeller = (detail: Record<string, any>) => {
        const allowedKeys = new Set([
            'user_id',
            'area_id',
            'area_ids',
            'areas',
            'areas_ids',
            'job_position_id',
            'job_position_ids',
            'job_positions',
            'seniority_id',
            'work_modality_id',
            'start_date'
        ])
        return Object.fromEntries(Object.entries(detail).filter(([key]) => allowedKeys.has(key)))
    }

    const industryBySeller = new Map<string, any[]>()
    for (const row of (industryBadges as any[]) || []) {
        const sellerId = String((row as any)?.seller_id || '')
        if (!sellerId) continue
        const list = industryBySeller.get(sellerId) || []
        list.push({
            source: 'industry',
            type: 'industry',
            key: String((row as any)?.industria_id || ''),
            label: String((row as any)?.industrias?.name || 'Industria'),
            level: Number((row as any)?.level || 0),
            progress: Number((row as any)?.closures_count || 0),
            updated_at: String((row as any)?.updated_at || '')
        })
        industryBySeller.set(sellerId, list)
    }

    const specialBySeller = new Map<string, any[]>()
    for (const row of (specialBadges as any[]) || []) {
        const sellerId = String((row as any)?.seller_id || '')
        if (!sellerId) continue
        const list = specialBySeller.get(sellerId) || []
        list.push({
            source: 'special',
            type: String((row as any)?.badge_type || 'special'),
            key: String((row as any)?.badge_key || ''),
            label: String((row as any)?.badge_label || 'Badge especial'),
            level: Number((row as any)?.level || 0),
            progress: Number((row as any)?.progress_count || 0),
            updated_at: String((row as any)?.updated_at || '')
        })
        specialBySeller.set(sellerId, list)
    }

    const employees = ((profiles as any[]) || []).map(p => {
        const rawDetail = (details || []).find((d: any) => d.user_id === p.id)
        const detail = rawDetail && !viewerIsAdmin
            ? sanitizeEmployeeDetailsForSeller(rawDetail as Record<string, any>)
            : (rawDetail || {})
        const sellerId = String((p as any)?.id || '')
        const industryList = industryBySeller.get(sellerId) || []
        const specialList = specialBySeller.get(sellerId) || []
        const adminDistinctions = specialList
            .filter((badge) => String(badge?.type || '') === 'admin_granted')
            .sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'es', { sensitivity: 'base' }))
            .slice(0, 4)
        const featuredBadges = [...industryList, ...specialList]
            .filter((badge) => String(badge?.type || '') !== 'admin_granted')
            .sort((a, b) => {
                const levelDiff = Number(b.level || 0) - Number(a.level || 0)
                if (levelDiff !== 0) return levelDiff
                const progressDiff = Number(b.progress || 0) - Number(a.progress || 0)
                if (progressDiff !== 0) return progressDiff
                return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
            })
            .slice(0, 5)
        const fullName = String((p as any)?.full_name || '').trim()
        const isGrantingAdmin = String((p as any)?.role || '') === 'admin' && BADGE_GRANT_ALLOWED_ADMINS.has(fullName)
        const grantCount = (((shouldIgnoreAdminBadgeGrantsError ? [] : adminBadgeGrants) as any[]) || []).reduce((acc, row) => (
            String((row as any)?.admin_id || '') === sellerId && String((row as any)?.badge_type || '') === 'admin_granted'
                ? acc + 1
                : acc
        ), 0)
        const grantableAdminBadge = isGrantingAdmin
            ? {
                source: 'special',
                type: 'admin_granted',
                key: `admin_${fullName.toLowerCase().replace(/\s+/g, '_')}`,
                label: `Distinción de ${fullName}`,
                level: 1,
                progress: grantCount,
                updated_at: '',
                meta: {
                    isGrantableAdminBadge: true,
                    grantsGivenCount: grantCount
                }
            }
            : null
        return {
            ...p,
            details: detail,
            badgeShowcase: {
                adminDistinctions,
                featuredBadges,
                grantableAdminBadge
            }
        }
    })

    return (
        <div className='min-h-full flex flex-col p-8 overflow-y-auto custom-scrollbar' style={{ background: 'transparent' }}>
            <div className='max-w-7xl mx-auto space-y-10 w-full'>
                <UsersClient
                    initialUsers={employees || []}
                />
            </div>
            <RichardDawkinsFooter />
        </div>
    )
}
