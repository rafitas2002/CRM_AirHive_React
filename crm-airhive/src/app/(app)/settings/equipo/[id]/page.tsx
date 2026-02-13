import ProfileView from '@/components/ProfileView'

export default async function TeamMemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return (
        <div className='p-8 max-w-7xl mx-auto'>
            <ProfileView userId={id} />
        </div>
    )
}
