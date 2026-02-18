'use client'

import { useState, useEffect } from 'react'
import { Search, Briefcase, Filter, Users, User, Building2 } from 'lucide-react'
import DetailedUserModal from '@/components/DetailedUserModal'
import RoleBadge from '@/components/RoleBadge'
import { getCatalogs } from '@/app/actions/catalogs'
import { getRoleMeta } from '@/lib/roleUtils'
import { useTheme } from '@/lib/ThemeContext'

interface UsersClientProps {
    initialUsers: any[]
}

interface AreaColorMeta {
    bg: string
    border: string
    text: string
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

function hashSeed(seed: string): number {
    let hash = 0
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
    return hash
}

function positiveMod(value: number, base: number): number {
    return ((value % base) + base) % base
}

function normalizeAreaName(areaName: string): string {
    return areaName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

function getSemanticAreaHue(areaName?: string): number | null {
    if (!areaName) return null
    const normalized = normalizeAreaName(areaName)
    const has = (token: string) => normalized.includes(token)

    if (has('finanza')) return 132
    if (has('recursos humanos') || has('recurso humano') || normalized === 'rh') return 50 // amarillo
    if (has('comercial') || has('ventas') || has('venta')) return 152 // verde-menta
    if (has('marketing')) return 322 // fuchsia
    if (has('legal')) return 6 // rojo
    if (has('tecnolog') || has('desarrollo') || has('developers') || has('developer')) return 212 // azul
    if (has('diseno')) return 276 // morado
    if (has('producto')) return 292 // lila
    if (has('operacion')) return 24 // naranja/melon
    if (has('soporte')) return 188 // cyan
    if (has('administracion')) return 32 // ambar
    if (has('direccion')) return 232 // indigo
    if (has('datos') || has('/ bi') || has('bi')) return 248 // violeta-azulado
    if (has('innovacion')) return 168 // turquesa
    if (has('proyecto')) return 20 // salmon
    if (has('customer success')) return 342 // rosa-salmon
    if (has('otro')) return 30 // taupe warm

    if (has('directores')) return 258 // violeta
    if (has('equipo de marketing')) return 314 // magenta fuerte
    if (has('equipo de ventas')) return 144 // verde brillante
    if (has('equipo de developers')) return 206 // azul acero

    return null
}

function getAreaColorFromSeed(seed: string, theme: 'claro' | 'gris' | 'oscuro', areaName?: string): AreaColorMeta {
    const hash = hashSeed(seed)
    const huePalette = [
        4, 18, 30, 42, 54, 66, 78, 92, 108, 124, 140, 156, 172, 188, 204, 220, 236, 252, 268, 284, 300, 316, 332, 348
    ]
    const semanticHue = getSemanticAreaHue(areaName)
    const semanticOffset = (hash % 2 === 0) ? -6 : 8
    const hue = semanticHue !== null ? positiveMod(semanticHue + semanticOffset, 360) : huePalette[hash % huePalette.length]
    const toneVariant = positiveMod(hash >>> 4, 4)
    const satVariant = positiveMod(hash >>> 7, 3)

    if (theme === 'claro') {
        const lightThemeTones = [
            { bgL: 95, borderL: 64, textL: 24, sat: 78 },
            { bgL: 92, borderL: 58, textL: 22, sat: 84 },
            { bgL: 90, borderL: 54, textL: 20, sat: 88 },
            { bgL: 96, borderL: 68, textL: 28, sat: 72 }
        ]
        const tone = lightThemeTones[toneVariant]
        const sat = tone.sat + satVariant * 4
        return {
            bg: `hsl(${hue} ${sat}% ${tone.bgL}%)`,
            border: `hsl(${hue} ${Math.max(56, sat - 14)}% ${tone.borderL}%)`,
            text: `hsl(${hue} ${Math.max(62, sat - 10)}% ${tone.textL}%)`
        }
    }

    if (theme === 'gris') {
        const grayThemeTones = [
            { bgL: 24, borderL: 58, textL: 87, sat: 78, alpha: 0.42 },
            { bgL: 20, borderL: 64, textL: 90, sat: 84, alpha: 0.44 },
            { bgL: 28, borderL: 54, textL: 84, sat: 72, alpha: 0.40 },
            { bgL: 18, borderL: 68, textL: 91, sat: 88, alpha: 0.46 }
        ]
        const tone = grayThemeTones[toneVariant]
        const sat = tone.sat + satVariant * 4
        return {
            bg: `hsl(${hue} ${sat}% ${tone.bgL}% / ${tone.alpha})`,
            border: `hsl(${hue} ${Math.max(66, sat - 8)}% ${tone.borderL}% / 0.82)`,
            text: `hsl(${hue} ${Math.max(82, sat - 2)}% ${tone.textL}%)`
        }
    }

    const darkThemeTones = [
        { bgL: 20, borderL: 50, textL: 83, sat: 78, alpha: 0.46 },
        { bgL: 16, borderL: 58, textL: 88, sat: 84, alpha: 0.50 },
        { bgL: 24, borderL: 46, textL: 80, sat: 72, alpha: 0.44 },
        { bgL: 14, borderL: 62, textL: 90, sat: 88, alpha: 0.52 }
    ]
    const tone = darkThemeTones[toneVariant]
    const sat = tone.sat + satVariant * 4
    return {
        bg: `hsl(${hue} ${sat}% ${tone.bgL}% / ${tone.alpha})`,
        border: `hsl(${hue} ${Math.max(66, sat - 8)}% ${tone.borderL}% / 0.84)`,
        text: `hsl(${hue} ${Math.max(82, sat - 2)}% ${tone.textL}%)`
    }
}

export default function UsersClient({ initialUsers }: UsersClientProps) {
    const { theme } = useTheme()
    const [users] = useState(initialUsers)
    const [search, setSearch] = useState('')
    const [selectedArea, setSelectedArea] = useState<string | null>(null)
    const [selectedPosition, setSelectedPosition] = useState<string | null>(null)
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

    const areaColorMap: Record<string, AreaColorMeta> = ((catalogs.areas || []) as { id: string, name?: string }[])
        .reduce((acc: Record<string, AreaColorMeta>, area) => {
            if (area?.id) acc[area.id] = getAreaColorFromSeed(area.id, theme, area.name)
            return acc
        }, {})

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div
                        className="w-16 h-16 rounded-[22px] border flex items-center justify-center shadow-lg shrink-0 ah-window-title-icon-shell"
                    >
                        <Users size={34} className='ah-window-title-icon' strokeWidth={1.9} />
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
                        className="ah-search-input rounded-2xl text-sm font-bold"
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
                        className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-2 cursor-pointer ${!selectedArea
                            ? 'bg-[#2048FF] border-[#2048FF] text-white shadow-lg shadow-blue-500/20'
                            : 'bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--text-secondary)] hover:border-[#2048FF]/30'
                            }`}
                    >
                        Todas
                    </button>
                    {(catalogs.areas || []).map(area => (
                        (() => {
                            const colorMeta = areaColorMap[area.id] || getAreaColorFromSeed(area.id || area.name, theme, area.name)
                            const isSelected = selectedArea === area.id

                            return (
                                <button
                                    key={area.id}
                                    onClick={() => setSelectedArea(area.id)}
                                    className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-2 cursor-pointer ${isSelected
                                        ? 'shadow-lg'
                                        : 'bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--text-secondary)] hover:bg-[var(--area-hover-bg)] hover:text-[var(--area-hover-text)] hover:border-[var(--area-hover-border)]'
                                        }`}
                                    style={isSelected
                                        ? {
                                            background: colorMeta.bg,
                                            borderColor: colorMeta.border,
                                            color: colorMeta.text,
                                            boxShadow: `0 14px 30px -20px ${colorMeta.border}`
                                        }
                                        : {
                                            ['--area-hover-bg' as string]: colorMeta.bg,
                                            ['--area-hover-border' as string]: colorMeta.border,
                                            ['--area-hover-text' as string]: colorMeta.text
                                        }}
                                >
                                    {area.name}
                                </button>
                            )
                        })()
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
                            className="group bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 transition-all duration-300 cursor-pointer hover:shadow-2xl hover:-translate-y-1 hover:border-[var(--role-border-color)] hover:border-[2.5px] relative overflow-hidden active:scale-[0.98]"
                            style={{
                                ['--role-border-color' as string]: roleMeta.borderColor,
                                boxShadow: `0 20px 45px -26px ${roleMeta.borderColor}`
                            }}
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />

                            <div className="flex flex-col items-center text-center space-y-4">
                                <div
                                    className="w-20 h-20 rounded-2xl border-2 border-[var(--card-border)] overflow-hidden transition-colors shadow-lg group-hover:border-[var(--role-border-color)] group-hover:border-[3px]"
                                >
                                    {user.avatar_url ? (
                                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div
                                            className="w-full h-full flex items-center justify-center"
                                            style={{ background: 'var(--hover-bg)' }}
                                        >
                                            <User size={32} strokeWidth={1.9} style={{ color: roleMeta.textColor }} />
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h3
                                        className="text-lg font-black text-[var(--text-primary)] transition-colors line-clamp-1 group-hover:brightness-110"
                                        style={{ color: roleMeta.textColor }}
                                    >
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
                                                const colorMeta = areaColorMap[area.id] || getAreaColorFromSeed(area.id || area.name, theme, area.name)
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
