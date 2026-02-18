'use client'

import { useState, useEffect } from 'react'
import { Search, Briefcase, Filter, Users, User, Building2 } from 'lucide-react'
import DetailedUserModal from '@/components/DetailedUserModal'
import RoleBadge from '@/components/RoleBadge'
import { getCatalogs } from '@/app/actions/catalogs'
import { getRoleMeta } from '@/lib/roleUtils'

interface UsersClientProps {
    initialUsers: any[]
}

interface AreaColorMeta {
    bg: string
    border: string
    text: string
    bgStrong: string
    borderStrong: string
}

function getUserAreaIds(user: any): string[] {
    const detailAreas = user?.details?.area_ids ?? user?.details?.areas_ids ?? user?.details?.areas
    const normalized = new Set<string>()

    if (Array.isArray(detailAreas)) {
        detailAreas.forEach(area => {
            if (typeof area === 'string' && area.trim()) normalized.add(area.trim())
            if (area && typeof area === 'object' && typeof area.id === 'string' && area.id.trim()) normalized.add(area.id.trim())
        })
    } else if (typeof detailAreas === 'string' && detailAreas.trim()) {
        detailAreas.split(',').map(v => v.trim()).filter(Boolean).forEach(v => normalized.add(v))
    }

    const fallbackAreaId = user?.details?.area_id
    if (typeof fallbackAreaId === 'string' && fallbackAreaId.trim()) normalized.add(fallbackAreaId.trim())

    return Array.from(normalized)
}

function getUniqueAreaColor(index: number): AreaColorMeta {
    // Golden-angle distribution over hue wheel gives visually distinct colors.
    const hue = (index * 137.508) % 360
    return {
        bg: `hsl(${hue} 92% 96%)`,
        border: `hsl(${hue} 70% 78%)`,
        text: `hsl(${hue} 75% 32%)`,
        bgStrong: `hsl(${hue} 78% 42%)`,
        borderStrong: `hsl(${hue} 72% 38%)`
    }
}

function fallbackAreaColor(seed: string): AreaColorMeta {
    const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return getUniqueAreaColor(hash)
}

function getSemanticAreaColor(name: string, index: number): AreaColorMeta {
    const areaName = name.toLowerCase()
    if (areaName.includes('rh') || areaName.includes('recursos')) {
        return { bg: '#FEF9C3', border: '#FACC15', text: '#854D0E', bgStrong: '#EAB308', borderStrong: '#CA8A04' }
    }
    if (areaName.includes('finanza')) {
        return { bg: '#DCFCE7', border: '#22C55E', text: '#166534', bgStrong: '#16A34A', borderStrong: '#15803D' }
    }
    if (areaName.includes('director')) {
        return { bg: '#F3E8FF', border: '#A855F7', text: '#6B21A8', bgStrong: '#9333EA', borderStrong: '#7E22CE' }
    }
    if (areaName.includes('comercial') || areaName.includes('ventas')) {
        return { bg: '#DBEAFE', border: '#2563EB', text: '#1E3A8A', bgStrong: '#2563EB', borderStrong: '#1D4ED8' }
    }
    if (areaName.includes('marketing')) {
        return { bg: '#FFE4E6', border: '#F43F5E', text: '#9F1239', bgStrong: '#E11D48', borderStrong: '#BE123C' }
    }
    return getUniqueAreaColor(index)
}

export default function UsersClient({ initialUsers }: UsersClientProps) {
    const [users] = useState(initialUsers)
    const [search, setSearch] = useState('')
    const [selectedArea, setSelectedArea] = useState<string | null>(null)
    const [selectedPosition, setSelectedPosition] = useState<string | null>(null)
    const [hoveredArea, setHoveredArea] = useState<string | null>(null)
    const [selectedUser, setSelectedUser] = useState<any>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [catalogs, setCatalogs] = useState<Record<string, any[]>>({})

    useEffect(() => {
        const fetchCats = async () => {
            const res = await getCatalogs()
            if (res.success) setCatalogs(res.data || {})
        }
        fetchCats()
    }, [])

    const filteredUsers = users.filter(user => {
        const searchLower = search.toLowerCase()
        const fullName = (user.full_name || '').toLowerCase()
        const role = (user.role || '').toLowerCase()
        const areaNames = getUserAreaIds(user).map(id => resolve('areas', id)).filter(Boolean)
        const department = areaNames.join(' ').toLowerCase()
        const position = (user.details?.job_position_id ? resolve('job_positions', user.details.job_position_id) : '').toLowerCase()

        const matchesSearch = fullName.includes(searchLower) || role.includes(searchLower) || department.includes(searchLower) || position.includes(searchLower)
        const matchesArea = !selectedArea || getUserAreaIds(user).includes(selectedArea)
        const matchesPosition = !selectedPosition || user.details?.job_position_id === selectedPosition

        return matchesSearch && matchesArea && matchesPosition
    })

    function resolve(table: string, id: string) {
        if (!id) return ''
        const list = catalogs[table] || []
        const item = list.find(i => i.id === id)
        return item ? item.name : ''
    }

    const areaColorMap: Record<string, AreaColorMeta> = ((catalogs.areas || []) as { id: string, name: string }[])
        .reduce((acc: Record<string, AreaColorMeta>, area, index) => {
            if (area?.id) acc[area.id] = getSemanticAreaColor(area.name || '', index)
            return acc
        }, {})

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="ah-icon-card shrink-0">
                        <Users size={34} strokeWidth={1.9} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-[var(--text-primary)] tracking-tight">
                            Directorio de Equipo
                        </h1>
                        <p className="text-[var(--text-secondary)] mt-2 font-medium">Conoce a todos los integrantes de la organización</p>
                    </div>
                </div>

                <div className="relative max-w-md w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, puesto o área..."
                        className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-[var(--text-primary)] focus:ring-2 focus:ring-[#2048FF]/20 focus:border-[#2048FF] outline-none transition-all shadow-sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Filters */}
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">Área:</span>
                    <button
                        onClick={() => setSelectedArea(null)}
                        className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-2 ${!selectedArea
                            ? 'bg-[#2048FF] border-[#2048FF] text-white shadow-lg shadow-blue-500/20'
                            : 'bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--text-secondary)] hover:border-[#2048FF]/30'
                            }`}
                    >
                        Todas
                    </button>
                    {(catalogs.areas || []).map(area => (
                        <button
                            key={area.id}
                            onClick={() => setSelectedArea(area.id)}
                            onMouseEnter={() => setHoveredArea(area.id)}
                            onMouseLeave={() => setHoveredArea(null)}
                            className='px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-2 cursor-pointer'
                            style={{
                                background: selectedArea === area.id
                                    ? (areaColorMap[area.id]?.bgStrong || '#2048FF')
                                    : (hoveredArea === area.id ? (areaColorMap[area.id]?.bg || 'var(--hover-bg)') : 'var(--card-bg)'),
                                borderColor: selectedArea === area.id
                                    ? (areaColorMap[area.id]?.borderStrong || '#2048FF')
                                    : (hoveredArea === area.id ? (areaColorMap[area.id]?.border || 'var(--card-border)') : 'var(--card-border)'),
                                color: selectedArea === area.id
                                    ? '#ffffff'
                                    : (hoveredArea === area.id ? (areaColorMap[area.id]?.text || 'var(--text-primary)') : 'var(--text-secondary)'),
                                boxShadow: selectedArea === area.id ? `0 10px 22px -12px ${areaColorMap[area.id]?.borderStrong || '#2048FF'}` : 'none'
                            }}
                        >
                            {area.name}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3">
                    <div className="relative w-full">
                        <Filter className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] opacity-70" size={16} />
                        <select
                            value={selectedPosition || ''}
                            onChange={(e) => setSelectedPosition(e.target.value || null)}
                            className="w-full h-12 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] pl-14 pr-4 appearance-none text-[11px] font-black uppercase tracking-[0.08em] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[#2048FF]/20 focus:border-[#2048FF]"
                        >
                            <option value="">Puesto: Todos</option>
                            {(catalogs.job_positions || []).map(position => (
                                <option key={position.id} value={position.id}>{position.name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            setSelectedArea(null)
                            setSelectedPosition(null)
                        }}
                        className={`h-12 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-2 ${!selectedArea
                            && !selectedPosition
                            ? 'bg-[#1700AC] border-[#1700AC] text-white shadow-lg shadow-indigo-500/20'
                            : 'bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--text-secondary)] hover:border-[#2048FF]/30'
                            }`}
                    >
                        Limpiar Filtros
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredUsers.map(user => {
                    const roleMeta = getRoleMeta(user.role)
                    const isAdmin = user.role === 'admin'
                    const silhouetteColor = isAdmin ? '#F59E0B' : roleMeta.textColor
                    const cardHoverClass = isAdmin
                        ? 'hover:border-amber-400 hover:shadow-amber-500/10'
                        : 'hover:border-emerald-400 hover:shadow-emerald-500/10'
                    const avatarHoverClass = isAdmin
                        ? 'group-hover:border-amber-400'
                        : 'group-hover:border-emerald-400'
                    const nameHoverClass = isAdmin
                        ? 'group-hover:text-amber-300'
                        : 'group-hover:text-emerald-300'
                    const areaIds = getUserAreaIds(user)
                    const areaItems = areaIds
                        .map(areaId => {
                            const name = resolve('areas', areaId)
                            return name ? { id: areaId, name } : null
                        })
                        .filter(Boolean) as { id: string, name: string }[]

                    return (
                        <div
                            key={user.id}
                            onClick={() => {
                                setSelectedUser(user)
                                setIsModalOpen(true)
                            }}
                            className={`group bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 transition-all cursor-pointer hover:shadow-2xl relative overflow-hidden active:scale-[0.98] ${cardHoverClass}`}
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />

                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className={`w-20 h-20 rounded-2xl border-2 border-[var(--card-border)] overflow-hidden transition-colors shadow-lg ${avatarHoverClass}`}>
                                    {user.avatar_url ? (
                                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div
                                            className="w-full h-full flex items-center justify-center"
                                            style={{ background: 'var(--hover-bg)' }}
                                        >
                                            <User size={32} strokeWidth={1.9} style={{ color: silhouetteColor }} />
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h3 className={`text-lg font-black text-[var(--text-primary)] transition-colors line-clamp-1 ${nameHoverClass}`}>
                                        {user.full_name}
                                    </h3>
                                    <p className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-[0.2em] mt-1">
                                        {resolve('job_positions', user.details?.job_position_id) || roleMeta.label}
                                    </p>
                                    <RoleBadge role={user.role} className='mt-2' compact />
                                </div>

                                <div className="w-full pt-4 border-t border-[var(--card-border)] flex flex-col gap-2">
                                    {areaItems.length > 0 ? (
                                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                                            {areaItems.map(area => {
                                                const colorMeta = areaColorMap[area.id] || fallbackAreaColor(area.id || area.name)
                                                return (
                                                    <span
                                                        key={`${user.id}-${area.id}`}
                                                        title={area.name}
                                                        className='px-2.5 py-1 rounded-xl border text-[9px] font-black uppercase tracking-[0.12em] inline-flex items-center gap-1.5'
                                                        style={{ background: colorMeta.bg, borderColor: colorMeta.border, color: colorMeta.text }}
                                                    >
                                                        <Building2 size={11} strokeWidth={1.9} style={{ color: colorMeta.text }} />
                                                        {area.name}
                                                    </span>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <span className="px-3 py-1.5 bg-[var(--hover-bg)] rounded-xl text-[10px] font-bold text-[var(--text-secondary)] flex items-center gap-2 justify-center">
                                            <Briefcase size={12} className="text-[#2048FF]" />
                                            Sin Área
                                        </span>
                                    )}
                                    <span className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60">
                                        {user.username || user.email || ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )
                })}

                {filteredUsers.length === 0 && (
                    <div className="col-span-full py-20 text-center space-y-4 border-2 border-dashed border-[var(--card-border)] rounded-[40px] opacity-50">
                        <div className="w-16 h-16 bg-[var(--hover-bg)] rounded-full flex items-center justify-center mx-auto text-[var(--text-secondary)]">
                            <Search size={32} />
                        </div>
                        <p className="text-lg font-bold text-[var(--text-secondary)]">No se encontraron usuarios</p>
                    </div>
                )}
            </div>

            {selectedUser && (
                <DetailedUserModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    user={selectedUser}
                    catalogs={catalogs}
                />
            )}
        </div>
    )
}
