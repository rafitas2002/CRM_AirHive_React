'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'

export type CompanyData = {
    id?: string
    nombre: string
    tamano: number // 1-5
    ubicacion: string
    logo_url: string
    industria: string
    website: string
    descripcion: string
}

interface CompanyModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: CompanyData) => Promise<void>
    initialData?: CompanyData | null
    mode?: 'create' | 'edit'
    companies?: CompanyData[]
}

export default function CompanyModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    mode = 'create',
    companies = []
}: CompanyModalProps) {
    const [formData, setFormData] = useState<CompanyData>({
        nombre: '',
        tamano: 1,
        ubicacion: '',
        logo_url: '',
        industria: '',
        website: '',
        descripcion: ''
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const [supabase] = useState(() => createClient())

    // Autocomplete state
    const [filteredCompanies, setFilteredCompanies] = useState<CompanyData[]>([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const wrapperRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (isOpen && initialData) {
            setFormData(initialData)
        } else if (isOpen && !initialData) {
            setFormData({
                nombre: '',
                tamano: 1,
                ubicacion: '',
                logo_url: '',
                industria: '',
                website: '',
                descripcion: ''
            })
        }
    }, [isOpen, initialData])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [wrapperRef])

    const handleNombreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setFormData({ ...formData, nombre: value })

        if (value.length > 0) {
            const filtered = companies.filter(c =>
                c.nombre.toLowerCase().includes(value.toLowerCase())
            )
            setFilteredCompanies(filtered)
            setShowSuggestions(true)
        } else {
            setShowSuggestions(false)
        }
    }

    const selectCompany = (company: CompanyData) => {
        setFormData({
            ...company,
            // Ensure id is kept if we want to update the existing one, 
            // but the parent might handle that.
        })
        setShowSuggestions(false)
    }

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) {
            return
        }
        setUploadingLogo(true)
        const file = e.target.files[0]
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `${fileName}`

        try {
            const { error: uploadError } = await supabase.storage
                .from('company-logos')
                .upload(filePath, file)

            if (uploadError) {
                throw uploadError
            }

            const { data } = supabase.storage.from('company-logos').getPublicUrl(filePath)

            setFormData(prev => ({ ...prev, logo_url: data.publicUrl }))
        } catch (error) {
            console.error('Error uploading logo:', error)
            alert('Error al subir el logo')
        } finally {
            setUploadingLogo(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            await onSave(formData)
            onClose()
        } catch (error) {
            console.error('Error saving company:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className='fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity'>
            <div className='w-full max-w-2xl bg-white rounded-2xl shadow-2xl transform transition-all overflow-hidden flex flex-col max-h-[90vh]'>
                {/* Header */}
                <div className='bg-[#1700AC] px-6 py-4 flex items-center justify-between shrink-0'>
                    <h2 className='text-xl font-bold text-white'>
                        Detalles de la Empresa
                    </h2>
                    <button
                        onClick={onClose}
                        className='text-white/70 hover:text-white transition-colors'
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className='p-8 overflow-y-auto custom-scrollbar space-y-6'>
                    <form id='company-form' onSubmit={handleSubmit} className='space-y-6'>

                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            {/* Logo Upload Section */}
                            <div className='col-span-1 md:col-span-2 flex flex-col items-center justify-center space-y-4 p-6 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50'>
                                <div className='relative w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-lg bg-gray-100 flex items-center justify-center group'>
                                    {formData.logo_url ? (
                                        <img
                                            src={formData.logo_url}
                                            alt="Company Logo"
                                            className='w-full h-full object-cover'
                                        />
                                    ) : (
                                        <div className='text-4xl text-gray-300 font-bold'>
                                            🏢
                                        </div>
                                    )}
                                    <div className='absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer'>
                                        <span className='text-white text-xs font-medium'>Cambiar</span>
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoUpload}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        disabled={uploadingLogo}
                                    />
                                </div>
                                <div className='text-center'>
                                    <p className='text-sm font-medium text-[#0F2A44]'>Logotipo de la Empresa</p>
                                    <p className='text-xs text-[#667085] mt-1'>
                                        {uploadingLogo ? 'Subiendo...' : 'Click en la imagen para subir (PNG, JPG)'}
                                    </p>
                                </div>
                            </div>

                            {/* Nombre with Autocomplete */}
                            <div className='space-y-1.5 relative' ref={wrapperRef}>
                                <label className='block text-sm font-medium text-[#0F2A44]'>
                                    Nombre de la Empresa
                                </label>
                                <input
                                    type='text'
                                    required
                                    placeholder='ej. Tesla Inc.'
                                    value={formData.nombre}
                                    onChange={handleNombreChange}
                                    className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                                    autoComplete="off"
                                />
                                {showSuggestions && filteredCompanies.length > 0 && (
                                    <div className='absolute z-[70] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto custom-scrollbar'>
                                        {filteredCompanies.map((company) => (
                                            <div
                                                key={company.id}
                                                onClick={() => selectCompany(company)}
                                                className='px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 transition-colors border-b border-gray-50 last:border-b-0 text-left'
                                            >
                                                <div className='font-medium'>{company.nombre}</div>
                                                <div className='text-xs text-gray-400'>{company.industria} • {company.ubicacion}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Industria */}
                            <div className='space-y-1.5'>
                                <label className='block text-sm font-medium text-[#0F2A44]'>
                                    Industria
                                </label>
                                <input
                                    type='text'
                                    placeholder='ej. Tecnología / Automotriz'
                                    value={formData.industria}
                                    onChange={(e) => setFormData({ ...formData, industria: e.target.value })}
                                    className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                                />
                            </div>

                            {/* Ubicación */}
                            <div className='space-y-1.5'>
                                <label className='block text-sm font-medium text-[#0F2A44]'>
                                    Ubicación
                                </label>
                                <input
                                    type='text'
                                    placeholder='ej. Austin, Texas'
                                    value={formData.ubicacion}
                                    onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                                    className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                                />
                            </div>

                            {/* Website */}
                            <div className='space-y-1.5'>
                                <label className='block text-sm font-medium text-[#0F2A44]'>
                                    Sitio Web
                                </label>
                                <input
                                    type='text'
                                    placeholder='ej. www.ejemplo.com o No disponible'
                                    value={formData.website}
                                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                    className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all'
                                />
                            </div>

                            {/* Tamaño (Slider 1-5) */}
                            <div className='col-span-1 md:col-span-2 space-y-2'>
                                <div className='flex justify-between items-center'>
                                    <label className='block text-sm font-medium text-[#0F2A44]'>
                                        Tamaño de la Empresa
                                    </label>
                                    <span className='font-bold text-[#1700AC] text-sm bg-blue-50 px-2 py-0.5 rounded'>
                                        Nivel {formData.tamano}
                                    </span>
                                </div>
                                <input
                                    type='range'
                                    min='1'
                                    max='5'
                                    step='1'
                                    value={formData.tamano}
                                    onChange={(e) => setFormData({ ...formData, tamano: Number(e.target.value) })}
                                    className='w-full h-2 bg-[#E0E0E0] rounded-lg appearance-none cursor-pointer accent-[#1700AC]'
                                />
                                <div className='flex justify-between text-xs text-[#667085] px-1'>
                                    <span>Startup (1)</span>
                                    <span>Pequeña (2)</span>
                                    <span>Mediana (3)</span>
                                    <span>Grande (4)</span>
                                    <span>Corporativo (5)</span>
                                </div>
                            </div>

                            {/* Descripción */}
                            <div className='col-span-1 md:col-span-2 space-y-1.5'>
                                <label className='block text-sm font-medium text-[#0F2A44]'>
                                    Descripción / Notas Adicionales
                                </label>
                                <textarea
                                    rows={4}
                                    value={formData.descripcion}
                                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                                    className='w-full px-3 py-2 border border-[#BDBBC7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[#000000] placeholder-[#BDBBC7] transition-all resize-none'
                                />
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className='bg-[#F5F6F8] px-6 py-4 flex items-center justify-end gap-3 shrink-0 border-t border-[#E0E0E0]'>
                    <button
                        type='button'
                        onClick={onClose}
                        className='px-4 py-2 text-[#667085] font-medium hover:text-[#0F2A44] transition-colors bg-white border border-[#BDBBC7] rounded-lg shadow-sm hover:shadow hover:border-[#667085]'
                    >
                        Cancelar
                    </button>
                    <button
                        type='submit'
                        form='company-form'
                        disabled={isSubmitting || uploadingLogo}
                        className='px-6 py-2 bg-[#1700AC] text-white font-medium rounded-lg shadow-md hover:bg-[#0F2A44] transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95'
                    >
                        {isSubmitting ? 'Guardando...' : 'Guardar Empresa'}
                    </button>
                </div>
            </div>
        </div>
    )
}
