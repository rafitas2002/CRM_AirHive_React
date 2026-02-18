'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, Eye, EyeOff, Briefcase, Activity, ChevronRight, User, Plus, Trash2 } from 'lucide-react'
import CatalogSelect from './CatalogSelect'
import { getCatalogs } from '@/app/actions/catalogs'
import { useAuth } from '@/lib/auth'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { createClient } from '@/lib/supabase'
import ImageCropper from './ImageCropper'
import { getRoleSilhouetteColor } from '@/lib/roleUtils'

interface EmployeeModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: any) => Promise<boolean>
    employee?: any | null
    readOnlyMode?: boolean
}

const TABS = [
    { id: 'identity', label: 'Identidad & Rol', icon: Briefcase }, // Puesto, Area, Seniority (RH)
    { id: 'personal', label: 'Datos Personales', icon: User },     // Educacion, Carrera, Ciudad (Employee)
    { id: 'contract', label: 'Contratación', icon: Activity },    // Contrato, Ingreso (RH)
]

function normalizeAreaIds(rawDetails: any): string[] {
    const raw = rawDetails?.area_ids ?? rawDetails?.areas_ids ?? rawDetails?.areas
    const areaIds = new Set<string>()

    if (Array.isArray(raw)) {
        raw.forEach(item => {
            if (typeof item === 'string' && item.trim()) areaIds.add(item.trim())
            if (item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim()) areaIds.add(item.id.trim())
        })
    } else if (typeof raw === 'string' && raw.trim()) {
        raw.split(',').map(v => v.trim()).filter(Boolean).forEach(v => areaIds.add(v))
    }

    if (typeof rawDetails?.area_id === 'string' && rawDetails.area_id.trim()) {
        areaIds.add(rawDetails.area_id.trim())
    }

    return Array.from(areaIds)
}

function normalizeJobPositionIds(rawDetails: any): string[] {
    const raw = rawDetails?.job_position_ids ?? rawDetails?.job_positions
    const jobPositionIds = new Set<string>()

    if (Array.isArray(raw)) {
        raw.forEach(item => {
            if (typeof item === 'string' && item.trim()) jobPositionIds.add(item.trim())
            if (item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim()) jobPositionIds.add(item.id.trim())
        })
    } else if (typeof raw === 'string' && raw.trim()) {
        raw.split(',').map(v => v.trim()).filter(Boolean).forEach(v => jobPositionIds.add(v))
    }

    if (typeof rawDetails?.job_position_id === 'string' && rawDetails.job_position_id.trim()) {
        jobPositionIds.add(rawDetails.job_position_id.trim())
    }

    return Array.from(jobPositionIds)
}

function buildComparableFormState(raw: any, isEditing: boolean) {
    const details = raw?.details || {}
    const comparableDetails = {
        job_position_id: details.job_position_id || '',
        job_position_ids: Array.from(new Set((Array.isArray(details.job_position_ids) ? details.job_position_ids : []).map((v: string) => (v || '').trim()).filter(Boolean))).sort(),
        area_ids: Array.from(new Set((Array.isArray(details.area_ids) ? details.area_ids : []).map((v: string) => (v || '').trim()).filter(Boolean))).sort(),
        seniority_id: details.seniority_id || '',
        gender_id: details.gender_id || '',
        education_level_id: details.education_level_id || '',
        career_id: details.career_id || '',
        university_id: details.university_id || '',
        contract_type_id: details.contract_type_id || '',
        work_modality_id: details.work_modality_id || '',
        city_id: details.city_id || '',
        country_id: details.country_id || '',
        birth_date: details.birth_date || '',
        start_date: details.start_date || '',
        employee_status: details.employee_status || 'activo'
    }

    return {
        fullName: raw?.fullName || '',
        email: raw?.email || '',
        role: raw?.role || 'seller',
        avatar_url: raw?.avatar_url || '',
        // In edit mode password is optional and should only count as a change if user typed one.
        password: isEditing ? !!(raw?.password && String(raw.password).trim()) : (raw?.password || ''),
        details: comparableDetails
    }
}

export default function EmployeeModal({ isOpen, onClose, onSave, employee, readOnlyMode = false }: EmployeeModalProps) {
    useBodyScrollLock(isOpen)
    const { profile: currentUser } = useAuth()
    const [supabase] = useState(() => createClient())

    // --- State ---
    const [activeTab, setActiveTab] = useState('identity')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [uploadingAvatar, setUploadingAvatar] = useState(false)
    const [tempImage, setTempImage] = useState<string | null>(null)
    const [isCropping, setIsCropping] = useState(false)
    const [initialSignature, setInitialSignature] = useState('')

    // Catalogs State
    const [catalogs, setCatalogs] = useState<Record<string, any[]>>({})
    const [loadingCatalogs, setLoadingCatalogs] = useState(false)

    // Permissions
    const isRH = currentUser?.role === 'admin' || currentUser?.role === 'rh'
    const canEdit = !readOnlyMode
    // If not RH/Admin, assumes generic employee who can only edit specific fields

    // Form Data
    const [formData, setFormData] = useState<any>({
        fullName: '',
        email: '',
        password: '',
        role: 'seller', // Auth role
        avatar_url: '',
        details: {
            // FKs
            job_position_id: '',
            job_position_ids: [''],
            area_ids: [''],
            seniority_id: '',
            gender_id: '',
            education_level_id: '',
            career_id: '',
            university_id: '',
            contract_type_id: '',
            work_modality_id: '',
            city_id: '',
            country_id: '',

            // Dates & Status
            birth_date: '',
            start_date: '',
            employee_status: 'activo'
        }
    })

    // --- Effects ---
    useEffect(() => {
        if (isOpen) {
            fetchCatalogs()
            setError('')
            setActiveTab('identity')

            if (employee) {
                const d = employee.details || {}
                const areaIds = normalizeAreaIds(d)
                const jobPositionIds = normalizeJobPositionIds(d)
                setFormData({
                    fullName: employee.full_name || '',
                    email: employee.username ? (employee.username.includes('@') ? employee.username : '') : '',
                    password: '',
                    role: employee.role || 'seller',
                    avatar_url: employee.avatar_url || '',
                    details: {
                        job_position_id: (jobPositionIds[0] || d.job_position_id || ''),
                        job_position_ids: jobPositionIds.length > 0 ? jobPositionIds : [''],
                        area_ids: areaIds.length > 0 ? areaIds : [''],
                        seniority_id: d.seniority_id || '',
                        gender_id: d.gender_id || '',
                        education_level_id: d.education_level_id || '',
                        career_id: d.career_id || '',
                        university_id: d.university_id || '',
                        contract_type_id: d.contract_type_id || '',
                        work_modality_id: d.work_modality_id || '',
                        city_id: d.city_id || '',
                        country_id: d.country_id || '',
                        birth_date: d.birth_date || '',
                        start_date: d.start_date || '',
                        employee_status: d.employee_status || 'activo'
                    }
                })
                const initialComparable = buildComparableFormState({
                    fullName: employee.full_name || '',
                    email: employee.username ? (employee.username.includes('@') ? employee.username : '') : '',
                    password: '',
                    role: employee.role || 'seller',
                    avatar_url: employee.avatar_url || '',
                    details: {
                        job_position_id: (jobPositionIds[0] || d.job_position_id || ''),
                        job_position_ids: jobPositionIds.length > 0 ? jobPositionIds : [''],
                        area_ids: areaIds.length > 0 ? areaIds : [''],
                        seniority_id: d.seniority_id || '',
                        gender_id: d.gender_id || '',
                        education_level_id: d.education_level_id || '',
                        career_id: d.career_id || '',
                        university_id: d.university_id || '',
                        contract_type_id: d.contract_type_id || '',
                        work_modality_id: d.work_modality_id || '',
                        city_id: d.city_id || '',
                        country_id: d.country_id || '',
                        birth_date: d.birth_date || '',
                        start_date: d.start_date || '',
                        employee_status: d.employee_status || 'activo'
                    }
                }, true)
                setInitialSignature(JSON.stringify(initialComparable))
            } else {
                // Default empty
                setFormData({
                    fullName: '', email: '', password: '', role: 'seller', avatar_url: '',
                    details: {
                        job_position_id: '', job_position_ids: [''], area_ids: [''], seniority_id: '', gender_id: '',
                        education_level_id: '', career_id: '', university_id: '',
                        contract_type_id: '', work_modality_id: '', city_id: '', country_id: '',
                        birth_date: '', start_date: '', employee_status: 'activo'
                    }
                })
                const initialComparable = buildComparableFormState({
                    fullName: '', email: '', password: '', role: 'seller', avatar_url: '',
                    details: {
                        job_position_id: '', job_position_ids: [''], area_ids: [''], seniority_id: '', gender_id: '',
                        education_level_id: '', career_id: '', university_id: '',
                        contract_type_id: '', work_modality_id: '', city_id: '', country_id: '',
                        birth_date: '', start_date: '', employee_status: 'activo'
                    }
                }, false)
                setInitialSignature(JSON.stringify(initialComparable))
            }
        }
    }, [isOpen, employee])

    const hasChanges = useMemo(() => {
        if (!isOpen) return false
        const currentComparable = buildComparableFormState(formData, !!employee)
        return JSON.stringify(currentComparable) !== initialSignature
    }, [formData, initialSignature, employee, isOpen])

    const fetchCatalogs = async () => {
        setLoadingCatalogs(true)
        const result = await getCatalogs()
        if (result.success && result.data) {
            setCatalogs(result.data)
        }
        setLoadingCatalogs(false)
    }

    // --- Helpers ---
    const calculateAge = (dateString: string) => {
        if (!dateString) return '-'
        const today = new Date()
        // Force UTC parsing for YYYY-MM-DD to avoid timezone shift
        const parts = dateString.split('-')
        const birthDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))

        let age = today.getFullYear() - birthDate.getFullYear()
        const m = today.getMonth() - birthDate.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--
        }
        return `${age} años`
    }

    const calculateTenure = (dateString: string) => {
        if (!dateString) return '-'
        // Force UTC parsing
        const parts = dateString.split('-')
        const start = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
        const now = new Date()

        let years = now.getFullYear() - start.getFullYear()
        let months = now.getMonth() - start.getMonth()
        const days = now.getDate() - start.getDate()

        if (days < 0) {
            months--
            // Approximate days in previous month could be added here if we wanted day precision
        }
        if (months < 0) {
            years--
            months += 12
        }

        if (years < 0) return 'Fecha futura'

        const partsArr = []
        if (years > 0) partsArr.push(`${years} año${years !== 1 ? 's' : ''}`)
        if (months > 0) partsArr.push(`${months} mes${months !== 1 ? 'es' : ''}`)

        if (years === 0 && months === 0) return 'Menos de 1 mes'

        return partsArr.join(' y ')
    }

    // --- Handlers ---
    const updateDetail = (field: string, value: any) => {
        setFormData((prev: any) => ({
            ...prev,
            details: { ...prev.details, [field]: value }
        }))
    }

    const updateAreaAtIndex = (index: number, value: string) => {
        setFormData((prev: any) => {
            const currentAreas = Array.isArray(prev.details.area_ids) ? [...prev.details.area_ids] : ['']
            currentAreas[index] = value
            return { ...prev, details: { ...prev.details, area_ids: currentAreas } }
        })
    }

    const updateJobPositionAtIndex = (index: number, value: string) => {
        setFormData((prev: any) => {
            const currentJobPositions = Array.isArray(prev.details.job_position_ids) ? [...prev.details.job_position_ids] : ['']
            currentJobPositions[index] = value
            return {
                ...prev,
                details: {
                    ...prev.details,
                    job_position_ids: currentJobPositions,
                    job_position_id: currentJobPositions.find((v: string) => (v || '').trim()) || ''
                }
            }
        })
    }

    const addAreaField = () => {
        setFormData((prev: any) => {
            const currentAreas = Array.isArray(prev.details.area_ids) ? [...prev.details.area_ids] : ['']
            return { ...prev, details: { ...prev.details, area_ids: [...currentAreas, ''] } }
        })
    }

    const addJobPositionField = () => {
        setFormData((prev: any) => {
            const currentJobPositions = Array.isArray(prev.details.job_position_ids) ? [...prev.details.job_position_ids] : ['']
            return { ...prev, details: { ...prev.details, job_position_ids: [...currentJobPositions, ''] } }
        })
    }

    const removeAreaField = (index: number) => {
        setFormData((prev: any) => {
            const currentAreas = Array.isArray(prev.details.area_ids) ? [...prev.details.area_ids] : ['']
            const nextAreas = currentAreas.filter((_: string, i: number) => i !== index)
            return { ...prev, details: { ...prev.details, area_ids: nextAreas.length > 0 ? nextAreas : [''] } }
        })
    }

    const removeJobPositionField = (index: number) => {
        setFormData((prev: any) => {
            const currentJobPositions = Array.isArray(prev.details.job_position_ids) ? [...prev.details.job_position_ids] : ['']
            const nextJobPositions = currentJobPositions.filter((_: string, i: number) => i !== index)
            const safeJobPositions = nextJobPositions.length > 0 ? nextJobPositions : ['']
            return {
                ...prev,
                details: {
                    ...prev.details,
                    job_position_ids: safeJobPositions,
                    job_position_id: safeJobPositions.find((v: string) => (v || '').trim()) || ''
                }
            }
        })
    }

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!canEdit) return
        if (!e.target.files || e.target.files.length === 0) return

        const file = e.target.files[0]
        const reader = new FileReader()
        reader.onload = () => {
            setTempImage(reader.result as string)
            setIsCropping(true)
        }
        reader.readAsDataURL(file)
    }

    const handleConfirmAvatarCrop = async (croppedBlob: Blob) => {
        setIsCropping(false)
        setUploadingAvatar(true)

        const employeePath = employee?.id || 'draft'
        const fileName = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.png`
        const filePath = `${employeePath}/${fileName}`

        try {
            const { error: uploadError } = await supabase.storage
                .from('profile-avatars')
                .upload(filePath, croppedBlob, {
                    upsert: false,
                    contentType: 'image/png'
                })

            if (uploadError) throw uploadError

            const { data } = supabase.storage.from('profile-avatars').getPublicUrl(filePath)
            setFormData((prev: any) => ({ ...prev, avatar_url: data.publicUrl }))
        } catch (err) {
            console.error('Error uploading profile avatar:', err)
            alert('No se pudo subir la foto de perfil')
        } finally {
            setUploadingAvatar(false)
            setTempImage(null)
        }
    }

    // For updating local catalog list when new item added
    const handleNewOption = (table: string, option: any) => {
        setCatalogs(prev => ({
            ...prev,
            [table]: [...(prev[table] || []), option].sort((a: any, b: any) => a.name.localeCompare(b.name))
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            const normalizedAreas = Array.from(new Set(
                (Array.isArray(formData.details?.area_ids) ? formData.details.area_ids : [])
                    .map((areaId: string) => (areaId || '').trim())
                    .filter(Boolean)
            ))
            const normalizedJobPositions = Array.from(new Set(
                (Array.isArray(formData.details?.job_position_ids) ? formData.details.job_position_ids : [])
                    .map((jobId: string) => (jobId || '').trim())
                    .filter(Boolean)
            ))

            const payload = {
                ...formData,
                details: {
                    ...formData.details,
                    area_ids: normalizedAreas,
                    job_position_ids: normalizedJobPositions,
                    job_position_id: normalizedJobPositions[0] || ''
                }
            }

            if (!canEdit) {
                throw new Error('Edición bloqueada: RH maestro está activo. Gestiona usuarios desde el módulo de RH.')
            }
            if (!hasChanges) {
                throw new Error('No hay cambios por guardar.')
            }

            const success = await onSave(payload)
            if (!success) {
                throw new Error('No se pudieron guardar los cambios de la ficha.')
            }
            alert(employee
                ? 'Los cambios de la ficha del empleado se guardaron correctamente.'
                : 'El nuevo empleado se registró correctamente.')
            onClose()
        } catch (err: any) {
            const message = String(err?.message || '')
            if (message.toLowerCase().includes('multiple áreas') || message.toLowerCase().includes('múltiples áreas')) {
                setError('No se pudo guardar: tu base aún no soporta múltiples áreas. Ejecuta la migración 012 y vuelve a intentar.')
            } else if (message.toLowerCase().includes('múltiples puestos') || message.toLowerCase().includes('multiple puestos')) {
                setError('No se pudo guardar: tu base aún no soporta múltiples puestos. Ejecuta la migración 024 y vuelve a intentar.')
            } else {
                setError(message || 'Error al guardar')
            }
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null
    const silhouetteColor = getRoleSilhouetteColor(formData.role || 'seller')
    const avatarBorderColor = `color-mix(in srgb, ${silhouetteColor} 70%, var(--card-border))`

    return (
        <AnimatePresence>
            <div className='ah-modal-overlay'>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className='ah-modal-panel w-full max-w-4xl'
                >
                    {/* Header */}
                    <div className='ah-modal-header'>
                        <div>
                            <h3 className='ah-modal-title text-lg'>
                                {employee ? 'Ficha de Empleado' : 'Nuevo Empleado'}
                            </h3>
                            <p className='ah-modal-subtitle'>Personal ID v2.0</p>
                        </div>
                        <button onClick={onClose} className='ah-modal-close'>
                            <X className='w-5 h-5 text-white' />
                        </button>
                    </div>

                    <div className='flex flex-1 overflow-hidden'>
                        {/* Sidebar */}
                        <div className='w-56 bg-[color-mix(in_srgb,var(--hover-bg)_84%,var(--card-bg))] border-r border-[var(--card-border)] py-4 px-2 space-y-1 flex-shrink-0 overflow-y-auto'>
                            {TABS.map(tab => {
                                const Icon = tab.icon
                                const isActive = activeTab === tab.id
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-all text-left
                                            ${isActive
                                                ? 'bg-[var(--card-bg)] text-[var(--input-focus)] shadow-sm border border-[color-mix(in_srgb,var(--input-focus)_24%,var(--card-border))]'
                                                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                                            }`}
                                    >
                                        <Icon size={18} className={isActive ? 'text-[var(--input-focus)]' : 'text-[var(--text-secondary)]'} />
                                        {tab.label}
                                        {isActive && <ChevronRight size={14} className='ml-auto text-[var(--input-focus)]' />}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Content */}
                        <div className='flex-1 overflow-y-auto p-8 bg-[var(--card-bg)] relative'>
                            {loadingCatalogs && (
                                <div className='absolute inset-0 bg-[color-mix(in_srgb,var(--card-bg)_84%,transparent)] z-10 flex items-center justify-center'>
                                    <div className='animate-pulse text-sm text-[var(--input-focus)] font-bold'>Cargando catálogos...</div>
                                </div>
                            )}

                            <form id='employee-form' onSubmit={handleSubmit} className='space-y-6 max-w-2xl mx-auto'>
                                {readOnlyMode && (
                                    <div className='p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm font-semibold'>
                                        Edición bloqueada: RH maestro está activo. Esta ficha es solo lectura en CRM.
                                    </div>
                                )}
                                {error && <div className='p-3 bg-red-50 text-red-600 text-sm rounded-lg'>{error}</div>}

                                {/* --- IDENTITY & ROLE (RH ONLY usually) --- */}
                                {activeTab === 'identity' && (
                                    <div className='space-y-6 animate-in fade-in slide-in-from-right-4 duration-300'>
                                        <div className='grid grid-cols-2 gap-5'>
                                            <div className='col-span-2 flex flex-col items-center justify-center gap-3 p-5 border-2 border-dashed border-[var(--card-border)] rounded-2xl bg-[var(--hover-bg)]'>
                                                <div
                                                    className='relative w-28 h-28 rounded-2xl overflow-hidden border-2 shadow-lg group'
                                                    style={{ borderColor: avatarBorderColor, background: 'var(--hover-bg)' }}
                                                >
                                                    {formData.avatar_url ? (
                                                        <img src={formData.avatar_url} alt='Foto de perfil' className='w-full h-full object-cover' />
                                                    ) : (
                                                        <div className='w-full h-full flex items-center justify-center'>
                                                            <User size={38} strokeWidth={1.9} style={{ color: silhouetteColor }} />
                                                        </div>
                                                    )}
                                                    <div className='absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center'>
                                                        <span className='text-white text-xs font-bold'>Cambiar</span>
                                                    </div>
                                                    <input
                                                        type='file'
                                                        accept='image/*'
                                                        onChange={handleAvatarUpload}
                                                        disabled={!canEdit || uploadingAvatar}
                                                        className='absolute inset-0 opacity-0 disabled:cursor-not-allowed'
                                                    />
                                                </div>
                                                <p className='text-xs font-semibold text-[var(--text-secondary)]'>
                                                    {uploadingAvatar ? 'Subiendo foto...' : 'Foto de perfil (temporal en CRM y reusable en RH)'}
                                                </p>
                                            </div>

                                            <div className='col-span-2'>
                                                <label className='label'>Nombre Completo *</label>
                                                <input required className='input' value={formData.fullName}
                                                    disabled={!canEdit}
                                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
                                            </div>

                                            {!employee && (
                                                <div className='col-span-2'>
                                                    <label className='label'>Correo Electrónico *</label>
                                                    <input type='email' required className='input' value={formData.email}
                                                        disabled={!canEdit}
                                                        onChange={e => setFormData({ ...formData, email: e.target.value })} />
                                                </div>
                                            )}

                                            <div className='col-span-2'>
                                                <label className='label'>{employee ? 'Contraseña (Opcional)' : 'Contraseña *'}</label>
                                                <div className='relative'>
                                                    <input type={showPassword ? 'text' : 'password'} required={!employee} minLength={6} className='input'
                                                        disabled={!canEdit}
                                                        value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                                                    <button type='button' disabled={!canEdit} onClick={() => setShowPassword(!showPassword)} className='absolute right-3 top-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-45'>
                                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <label className='label'>Rol de Acceso</label>
                                                <select className='input' value={formData.role} disabled={!isRH || !canEdit}
                                                    onChange={e => setFormData({ ...formData, role: e.target.value })}>
                                                    <option value='seller'>Vendedor</option>
                                                    <option value='admin'>Administrador</option>
                                                    <option value='rh'>Recursos Humanos</option>
                                                </select>
                                            </div>

                                            <div className='col-span-2 space-y-3'>
                                                <div className='flex items-center justify-between'>
                                                    <label className='label'>Puestos</label>
                                                    <button
                                                        type='button'
                                                        onClick={addJobPositionField}
                                                        disabled={!isRH || !canEdit}
                                                        className='inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] rounded-xl border border-[var(--card-border)] text-[var(--input-focus)] hover:bg-[color-mix(in_srgb,var(--input-focus)_11%,var(--card-bg))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                                    >
                                                        <Plus size={12} />
                                                        Agregar Otro Puesto
                                                    </button>
                                                </div>
                                                <div className='space-y-2'>
                                                    {(Array.isArray(formData.details.job_position_ids) ? formData.details.job_position_ids : ['']).map((jobPositionId: string, index: number) => (
                                                        <div key={`job-position-${index}`} className='flex items-start gap-2'>
                                                            <div className='flex-1'>
                                                                <CatalogSelect
                                                                    label={`Puesto ${index + 1}`}
                                                                    tableName='job_positions'
                                                                    disabled={!isRH || !canEdit}
                                                                    value={jobPositionId}
                                                                    options={catalogs['job_positions'] || []}
                                                                    onChange={v => updateJobPositionAtIndex(index, v)}
                                                                    onNewOption={o => handleNewOption('job_positions', o)}
                                                                />
                                                            </div>
                                                            <button
                                                                type='button'
                                                                onClick={() => removeJobPositionField(index)}
                                                                disabled={!isRH || !canEdit || (formData.details.job_position_ids || []).length <= 1}
                                                                className='mt-6 h-10 w-10 rounded-xl border border-[var(--card-border)] flex items-center justify-center text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
                                                                title='Eliminar puesto'
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className='col-span-2 space-y-3'>
                                                <div className='flex items-center justify-between'>
                                                    <label className='label'>Áreas</label>
                                                    <button
                                                        type='button'
                                                        onClick={addAreaField}
                                                        disabled={!isRH || !canEdit}
                                                        className='inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] rounded-xl border border-[var(--card-border)] text-[var(--input-focus)] hover:bg-[color-mix(in_srgb,var(--input-focus)_11%,var(--card-bg))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                                    >
                                                        <Plus size={12} />
                                                        Agregar Otra Área
                                                    </button>
                                                </div>

                                                <div className='space-y-2'>
                                                    {(Array.isArray(formData.details.area_ids) ? formData.details.area_ids : ['']).map((areaId: string, index: number) => (
                                                        <div key={`area-${index}`} className='flex items-start gap-2'>
                                                            <div className='flex-1'>
                                                                <CatalogSelect
                                                                    label={`Área ${index + 1}`}
                                                                    tableName='areas'
                                                                    disabled={!isRH || !canEdit}
                                                                    value={areaId}
                                                                    options={catalogs['areas'] || []}
                                                                    onChange={v => updateAreaAtIndex(index, v)}
                                                                    onNewOption={o => handleNewOption('areas', o)}
                                                                />
                                                            </div>
                                                            <button
                                                                type='button'
                                                                onClick={() => removeAreaField(index)}
                                                                disabled={!isRH || !canEdit || (formData.details.area_ids || []).length <= 1}
                                                                className='mt-6 h-10 w-10 rounded-xl border border-[var(--card-border)] flex items-center justify-center text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
                                                                title='Eliminar área'
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <CatalogSelect
                                                label='Seniority' tableName='seniority_levels' disabled={!isRH || !canEdit}
                                                value={formData.details.seniority_id}
                                                options={catalogs['seniority_levels'] || []}
                                                onChange={v => updateDetail('seniority_id', v)}
                                                onNewOption={o => handleNewOption('seniority_levels', o)}
                                            />

                                            <div>
                                                <label className='label'>Estado Empleado</label>
                                                <select className='input' value={formData.details.employee_status} disabled={!isRH || !canEdit}
                                                    onChange={e => updateDetail('employee_status', e.target.value)}>
                                                    <option value='activo'>Activo</option>
                                                    <option value='baja'>Baja</option>
                                                    <option value='pausa'>Pausa</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* --- PERSONAL DATA (Employee Can Edit) --- */}
                                {activeTab === 'personal' && (
                                    <div className='space-y-6 animate-in fade-in slide-in-from-right-4 duration-300'>
                                        <div className='grid grid-cols-2 gap-5'>
                                            <CatalogSelect
                                                label='Género' tableName='genders'
                                                value={formData.details.gender_id}
                                                options={catalogs['genders'] || []}
                                                onChange={v => updateDetail('gender_id', v)}
                                                onNewOption={o => handleNewOption('genders', o)}
                                            />

                                            <div>
                                                <label className='label flex justify-between'>
                                                    <span>Fecha de Nacimiento</span>
                                                    {formData.details.birth_date && (
                                                        <span className='text-[var(--input-focus)] font-medium'>{calculateAge(formData.details.birth_date)}</span>
                                                    )}
                                                </label>
                                                <input type='date' className='input' disabled={!isRH || !canEdit}
                                                    value={formData.details.birth_date} onChange={e => updateDetail('birth_date', e.target.value)} />
                                            </div>

                                            <div className='col-span-2'>
                                                <CatalogSelect
                                                    label='Carrera / Profesión' tableName='careers'
                                                    value={formData.details.career_id}
                                                    options={catalogs['careers'] || []}
                                                    onChange={v => updateDetail('career_id', v)}
                                                    onNewOption={o => handleNewOption('careers', o)}
                                                />
                                            </div>

                                            <CatalogSelect
                                                label='Nivel de Estudios' tableName='education_levels'
                                                value={formData.details.education_level_id}
                                                options={catalogs['education_levels'] || []}
                                                onChange={v => updateDetail('education_level_id', v)}
                                                onNewOption={o => handleNewOption('education_levels', o)}
                                            />

                                            <CatalogSelect
                                                label='Universidad' tableName='universities'
                                                value={formData.details.university_id}
                                                options={catalogs['universities'] || []}
                                                onChange={v => updateDetail('university_id', v)}
                                                onNewOption={o => handleNewOption('universities', o)}
                                            />

                                            <CatalogSelect
                                                label='Ciudad' tableName='cities'
                                                value={formData.details.city_id}
                                                options={catalogs['cities'] || []}
                                                onChange={v => updateDetail('city_id', v)}
                                                onNewOption={o => handleNewOption('cities', o)}
                                            />

                                            <CatalogSelect
                                                label='País' tableName='countries'
                                                value={formData.details.country_id}
                                                options={catalogs['countries'] || []}
                                                onChange={v => updateDetail('country_id', v)}
                                                onNewOption={o => handleNewOption('countries', o)}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* --- CONTRACT (RH ONLY) --- */}
                                {activeTab === 'contract' && (
                                    <div className='space-y-6 animate-in fade-in slide-in-from-right-4 duration-300'>
                                        <div className='grid grid-cols-2 gap-5'>
                                            <CatalogSelect
                                                label='Tipo de Contrato' tableName='contract_types' disabled={!isRH || !canEdit}
                                                value={formData.details.contract_type_id}
                                                options={catalogs['contract_types'] || []}
                                                onChange={v => updateDetail('contract_type_id', v)}
                                                onNewOption={o => handleNewOption('contract_types', o)}
                                            />

                                            <CatalogSelect
                                                label='Modalidad de Trabajo' tableName='work_modalities'
                                                disabled={!canEdit}
                                                value={formData.details.work_modality_id} // Employee can edit modality? Request says YES.
                                                options={catalogs['work_modalities'] || []}
                                                onChange={v => updateDetail('work_modality_id', v)}
                                                onNewOption={o => handleNewOption('work_modalities', o)}
                                            />

                                            <div>
                                                <label className='label'>Fecha de Ingreso</label>
                                                <input type='date' className='input' disabled={!isRH || !canEdit}
                                                    value={formData.details.start_date} onChange={e => updateDetail('start_date', e.target.value)} />
                                            </div>

                                            <div>
                                                <label className='label'>Antigüedad</label>
                                                <div className={`input ${formData.details.start_date ? 'bg-[color-mix(in_srgb,var(--input-focus)_10%,var(--card-bg))] text-[var(--input-focus)] font-bold' : 'bg-[color-mix(in_srgb,var(--hover-bg)_85%,var(--card-bg))] text-[var(--text-secondary)]'}`}>
                                                    {formData.details.start_date ? calculateTenure(formData.details.start_date) : '-'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className='p-6 border-t border-[var(--card-border)] bg-[color-mix(in_srgb,var(--hover-bg)_80%,var(--card-bg))] flex justify-end gap-3 flex-shrink-0'>
                        <button type='button' onClick={onClose}
                            className='px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] rounded-lg transition-colors'>
                            Cancelar
                        </button>
                        {!readOnlyMode && (
                            <button type='submit' form='employee-form' disabled={loading || uploadingAvatar || !hasChanges}
                                className='px-4 py-2 text-sm font-semibold text-white bg-[var(--input-focus)] hover:brightness-95 rounded-lg flex items-center gap-2 transition-all disabled:opacity-50'>
                                {loading ? <div className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' /> : <Save size={16} />}
                                Guardar Cambios
                            </button>
                        )}
                    </div>
                </motion.div>

                <style jsx>{`
                    .label {
                        display: block;
                        font-size: 0.75rem;
                        font-weight: 700;
                        color: var(--text-secondary);
                        text-transform: uppercase;
                        margin-bottom: 0.25rem;
                    }
                    .input {
                        width: 100%;
                        padding: 0.6rem 0.8rem;
                        border: 1px solid var(--input-border);
                        border-radius: 0.6rem;
                        background-color: var(--input-bg);
                        color: var(--text-primary);
                        font-size: 0.875rem;
                        outline: none;
                        transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
                    }
                    .input::placeholder {
                        color: color-mix(in srgb, var(--text-secondary) 72%, transparent);
                    }
                    .input:not(:disabled):hover {
                        border-color: color-mix(in srgb, var(--input-focus) 50%, var(--input-border));
                    }
                    .input:focus {
                        border-color: var(--input-focus);
                        box-shadow: 0 0 0 3px rgb(var(--input-focus-rgb) / 0.16);
                    }
                    .input:disabled {
                        opacity: 0.72;
                        background: color-mix(in srgb, var(--input-bg) 70%, var(--background));
                        cursor: not-allowed;
                    }
                `}</style>
            </div>
            {isCropping && tempImage && (
                <ImageCropper
                    imageSrc={tempImage}
                    onCropComplete={handleConfirmAvatarCrop}
                    onCancel={() => {
                        setIsCropping(false)
                        setTempImage(null)
                    }}
                />
            )}
        </AnimatePresence>
    )
}
