'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, Eye, EyeOff, Briefcase, Activity, Brain, Heart, ChevronRight, User } from 'lucide-react'
import CatalogSelect from './CatalogSelect'
import { getCatalogs } from '@/app/actions/catalogs'
import { useAuth } from '@/lib/auth'

interface EmployeeModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: any) => Promise<boolean>
    employee?: any | null
}

const TABS = [
    { id: 'identity', label: 'Identidad & Rol', icon: Briefcase }, // Puesto, Area, Seniority (RH)
    { id: 'personal', label: 'Datos Personales', icon: User },     // Educacion, Carrera, Ciudad (Employee)
    { id: 'contract', label: 'Contratación', icon: Activity },    // Contrato, Ingreso (RH)
]

export default function EmployeeModal({ isOpen, onClose, onSave, employee }: EmployeeModalProps) {
    const { profile: currentUser } = useAuth()

    // --- State ---
    const [activeTab, setActiveTab] = useState('identity')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [showPassword, setShowPassword] = useState(false)

    // Catalogs State
    const [catalogs, setCatalogs] = useState<Record<string, any[]>>({})
    const [loadingCatalogs, setLoadingCatalogs] = useState(false)

    // Permissions
    const isRH = currentUser?.role === 'admin' || currentUser?.role === 'rh'
    // If not RH/Admin, assumes generic employee who can only edit specific fields

    // Form Data
    const [formData, setFormData] = useState<any>({
        fullName: '',
        email: '',
        password: '',
        role: 'seller', // Auth role
        details: {
            // FKs
            job_position_id: '',
            area_id: '',
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
                setFormData({
                    fullName: employee.full_name || '',
                    email: employee.username ? (employee.username.includes('@') ? employee.username : '') : '',
                    password: '',
                    role: employee.role || 'seller',
                    details: {
                        job_position_id: d.job_position_id || '',
                        area_id: d.area_id || '',
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
            } else {
                // Default empty
                setFormData({
                    fullName: '', email: '', password: '', role: 'seller',
                    details: {
                        job_position_id: '', area_id: '', seniority_id: '', gender_id: '',
                        education_level_id: '', career_id: '', university_id: '',
                        contract_type_id: '', work_modality_id: '', city_id: '', country_id: '',
                        birth_date: '', start_date: '', employee_status: 'activo'
                    }
                })
            }
        }
    }, [isOpen, employee])

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
        let days = now.getDate() - start.getDate()

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
            const success = await onSave(formData)
            if (success) onClose()
        } catch (err: any) {
            setError(err.message || 'Error al guardar')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className='bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]'
                >
                    {/* Header */}
                    <div className='px-6 py-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0'>
                        <div>
                            <h3 className='text-lg font-bold text-[#0A1635]'>
                                {employee ? 'Ficha de Empleado' : 'Nuevo Empleado'}
                            </h3>
                            <p className='text-xs text-gray-500'>Personal ID v2.0</p>
                        </div>
                        <button onClick={onClose} className='p-2 hover:bg-gray-200 rounded-full transition-colors'>
                            <X className='w-5 h-5 text-gray-500' />
                        </button>
                    </div>

                    <div className='flex flex-1 overflow-hidden'>
                        {/* Sidebar */}
                        <div className='w-56 bg-gray-50 border-r py-4 px-2 space-y-1 flex-shrink-0 overflow-y-auto'>
                            {TABS.map(tab => {
                                const Icon = tab.icon
                                const isActive = activeTab === tab.id
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-all text-left
                                            ${isActive
                                                ? 'bg-white text-[#2048FF] shadow-sm ring-1 ring-black/5'
                                                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                                            }`}
                                    >
                                        <Icon size={18} className={isActive ? 'text-[#2048FF]' : 'text-gray-400'} />
                                        {tab.label}
                                        {isActive && <ChevronRight size={14} className='ml-auto' />}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Content */}
                        <div className='flex-1 overflow-y-auto p-8 bg-white relative'>
                            {loadingCatalogs && (
                                <div className='absolute inset-0 bg-white/80 z-10 flex items-center justify-center'>
                                    <div className='animate-pulse text-sm text-[#2048FF] font-bold'>Cargando catálogos...</div>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className='space-y-6 max-w-2xl mx-auto'>
                                {error && <div className='p-3 bg-red-50 text-red-600 text-sm rounded-lg'>{error}</div>}

                                {/* --- IDENTITY & ROLE (RH ONLY usually) --- */}
                                {activeTab === 'identity' && (
                                    <div className='space-y-6 animate-in fade-in slide-in-from-right-4 duration-300'>
                                        <div className='grid grid-cols-2 gap-5'>
                                            <div className='col-span-2'>
                                                <label className='label'>Nombre Completo *</label>
                                                <input required className='input' value={formData.fullName}
                                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
                                            </div>

                                            {!employee && (
                                                <div className='col-span-2'>
                                                    <label className='label'>Correo Electrónico *</label>
                                                    <input type='email' required className='input' value={formData.email}
                                                        onChange={e => setFormData({ ...formData, email: e.target.value })} />
                                                </div>
                                            )}

                                            <div className='col-span-2'>
                                                <label className='label'>{employee ? 'Contraseña (Opcional)' : 'Contraseña *'}</label>
                                                <div className='relative'>
                                                    <input type={showPassword ? 'text' : 'password'} required={!employee} minLength={6} className='input'
                                                        value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                                                    <button type='button' onClick={() => setShowPassword(!showPassword)} className='absolute right-3 top-2.5 text-gray-400'>
                                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <label className='label'>Rol de Acceso</label>
                                                <select className='input' value={formData.role} disabled={!isRH}
                                                    onChange={e => setFormData({ ...formData, role: e.target.value })}>
                                                    <option value='seller'>Vendedor</option>
                                                    <option value='admin'>Administrador</option>
                                                    <option value='rh'>Recursos Humanos</option>
                                                </select>
                                            </div>

                                            <CatalogSelect
                                                label='Puesto' tableName='job_positions' disabled={!isRH}
                                                value={formData.details.job_position_id}
                                                options={catalogs['job_positions'] || []}
                                                onChange={v => updateDetail('job_position_id', v)}
                                                onNewOption={o => handleNewOption('job_positions', o)}
                                            />

                                            <CatalogSelect
                                                label='Área' tableName='areas' disabled={!isRH}
                                                value={formData.details.area_id}
                                                options={catalogs['areas'] || []}
                                                onChange={v => updateDetail('area_id', v)}
                                                onNewOption={o => handleNewOption('areas', o)}
                                            />

                                            <CatalogSelect
                                                label='Seniority' tableName='seniority_levels' disabled={!isRH}
                                                value={formData.details.seniority_id}
                                                options={catalogs['seniority_levels'] || []}
                                                onChange={v => updateDetail('seniority_id', v)}
                                                onNewOption={o => handleNewOption('seniority_levels', o)}
                                            />

                                            <div>
                                                <label className='label'>Estado Empleado</label>
                                                <select className='input' value={formData.details.employee_status} disabled={!isRH}
                                                    onChange={e => updateDetail('employee_status', e.target.value)}>
                                                    <option value='activo'>🟢 Activo</option>
                                                    <option value='baja'>🔴 Baja</option>
                                                    <option value='pausa'>🟡 Pausa</option>
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
                                                        <span className='text-[#2048FF] font-medium'>{calculateAge(formData.details.birth_date)}</span>
                                                    )}
                                                </label>
                                                <input type='date' className='input' disabled={!isRH}
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
                                                label='Tipo de Contrato' tableName='contract_types' disabled={!isRH}
                                                value={formData.details.contract_type_id}
                                                options={catalogs['contract_types'] || []}
                                                onChange={v => updateDetail('contract_type_id', v)}
                                                onNewOption={o => handleNewOption('contract_types', o)}
                                            />

                                            <CatalogSelect
                                                label='Modalidad de Trabajo' tableName='work_modalities'
                                                value={formData.details.work_modality_id} // Employee can edit modality? Request says YES.
                                                options={catalogs['work_modalities'] || []}
                                                onChange={v => updateDetail('work_modality_id', v)}
                                                onNewOption={o => handleNewOption('work_modalities', o)}
                                            />

                                            <div>
                                                <label className='label'>Fecha de Ingreso</label>
                                                <input type='date' className='input' disabled={!isRH}
                                                    value={formData.details.start_date} onChange={e => updateDetail('start_date', e.target.value)} />
                                            </div>

                                            <div>
                                                <label className='label'>Antigüedad</label>
                                                <div className={`input ${formData.details.start_date ? 'bg-blue-50 text-[#2048FF] font-bold' : 'bg-gray-100 text-gray-500'}`}>
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
                    <div className='p-6 border-t bg-gray-50 flex justify-end gap-3 flex-shrink-0'>
                        <button type='button' onClick={onClose}
                            className='px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-lg'>
                            Cancelar
                        </button>
                        <button onClick={handleSubmit} disabled={loading}
                            className='px-4 py-2 text-sm font-semibold text-white bg-[#2048FF] hover:bg-[#1700AC] rounded-lg flex items-center gap-2 disabled:opacity-50'>
                            {loading ? <div className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' /> : <Save size={16} />}
                            Guardar Cambios
                        </button>
                    </div>
                </motion.div>

                <style jsx>{`
                    .label { display: block; font-size: 0.75rem; font-weight: 700; color: #6B7280; text-transform: uppercase; margin-bottom: 0.25rem; }
                    .input { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #E5E7EB; border-radius: 0.6rem; background-color: #F9FAFB; font-size: 0.875rem; outline: none; transition: all; }
                    .input:focus { border-color: #2048FF; ring: 2px solid #2048FF; background-color: white; }
                    .input:disabled { opacity: 0.7; cursor: not-allowed; }
                `}</style>
            </div>
        </AnimatePresence>
    )
}
