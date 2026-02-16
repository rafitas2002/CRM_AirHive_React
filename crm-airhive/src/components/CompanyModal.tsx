'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import ImageCropper from './ImageCropper'
import CatalogSelect from './CatalogSelect'
import { getCatalogs } from '@/app/actions/catalogs'

export type CompanyData = {
    id?: string
    nombre: string
    tamano: number // 1-5
    ubicacion: string
    logo_url: string
    industria: string
    industria_id?: string
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
        industria_id: '',
        website: '',
        descripcion: ''
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const [supabase] = useState(() => createClient())
    const [catalogs, setCatalogs] = useState<Record<string, any[]>>({})

    // Cropping state
    const [tempImage, setTempImage] = useState<string | null>(null)
    const [isCropping, setIsCropping] = useState(false)

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
                industria_id: '',
                website: '',
                descripcion: ''
            })
        }

        if (isOpen) {
            fetchCatalogs()
        }
    }, [isOpen, initialData])

    const fetchCatalogs = async () => {
        const res = await getCatalogs()
        if (res.success && res.data) {
            setCatalogs(res.data)
        } else if (res.error) {
            console.error('Error fetching catalogs:', res.error)
            // Only alert if it's specifically about industrias failing
            if (res.error.includes('industrias')) {
                alert('Aviso: No se pudieron cargar las industrias. Verifica que la tabla exista en Supabase.')
            }
        }
    }

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

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) {
            return
        }
        const file = e.target.files[0]
        const reader = new FileReader()
        reader.onload = () => {
            setTempImage(reader.result as string)
            setIsCropping(true)
        }
        reader.readAsDataURL(file)
    }

    // Location helpers
    const getLocationBase = (loc: string) => {
        if (!loc) return ''
        const base = loc.split(', ')[0]
        const mainCities = ['Monterrey', 'Guadalajara', 'CDMX', 'Querétaro']
        if (mainCities.includes(base)) return base
        return 'Otra'
    }

    const handleLocationBaseChange = (base: string) => {
        if (base === 'Otra') {
            setFormData({ ...formData, ubicacion: 'Otra' })
        } else if (base === 'Monterrey') {
            setFormData({ ...formData, ubicacion: 'Monterrey, ' })
        } else {
            setFormData({ ...formData, ubicacion: base })
        }
    }

    const handleConfirmCrop = async (croppedBlob: Blob) => {
        setIsCropping(false)
        setUploadingLogo(true)

        const fileName = `${Math.random()}.png`
        const filePath = `${fileName}`

        try {
            const { error: uploadError } = await supabase.storage
                .from('company-logos')
                .upload(filePath, croppedBlob)

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
            setTempImage(null)
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
        <div className='fixed inset-0 z-[60] flex items-start justify-center pt-16 pb-8 px-4 bg-black/60 backdrop-blur-sm transition-opacity overflow-y-auto'>
            <div className='w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl transform transition-all overflow-hidden flex flex-col max-h-[85vh]'>
                {/* Header */}
                <div className='bg-[#0A1635] px-6 py-4 flex items-center justify-between shrink-0 border-b border-[var(--card-border)]'>
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
                            <div className='col-span-1 md:col-span-2 flex flex-col items-center justify-center space-y-4 p-6 border-2 border-dashed border-[var(--card-border)] rounded-xl bg-[var(--hover-bg)]'>
                                <div className='relative w-32 h-32 rounded-full overflow-hidden border-4 border-[var(--card-bg)] shadow-lg bg-[var(--input-bg)] flex items-center justify-center group'>
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
                                    <p className='text-sm font-medium text-[var(--text-primary)]'>Logotipo de la Empresa</p>
                                    <p className='text-xs text-[var(--text-secondary)] mt-1'>
                                        {uploadingLogo ? 'Subiendo...' : 'Click en la imagen para subir (PNG, JPG)'}
                                    </p>
                                </div>
                            </div>

                            {/* Nombre with Autocomplete */}
                            <div className='space-y-1.5 relative' ref={wrapperRef}>
                                <label className='block text-sm font-medium text-[var(--text-primary)]'>
                                    Nombre de la Empresa
                                </label>
                                <input
                                    type='text'
                                    required
                                    placeholder='ej. Tesla Inc.'
                                    value={formData.nombre}
                                    onChange={handleNombreChange}
                                    className='w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] transition-all'
                                    autoComplete="off"
                                />
                                {showSuggestions && filteredCompanies.length > 0 && (
                                    <div className='absolute z-[70] w-full mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto custom-scrollbar'>
                                        {filteredCompanies.map((company) => (
                                            <div
                                                key={company.id}
                                                onClick={() => selectCompany(company)}
                                                className='px-4 py-2 hover:bg-[var(--hover-bg)] cursor-pointer text-sm text-[var(--text-primary)] transition-colors border-b border-[var(--card-border)] last:border-b-0 text-left'
                                            >
                                                <div className='font-medium'>{company.nombre}</div>
                                                <div className='text-xs text-[var(--text-secondary)]'>{company.industria} • {company.ubicacion}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Industria */}
                            <CatalogSelect
                                label="Industria"
                                value={formData.industria_id || ''}
                                onChange={(val) => {
                                    const name = catalogs.industrias?.find(i => i.id === val)?.name || ''
                                    setFormData({ ...formData, industria_id: val, industria: name })
                                }}
                                options={catalogs.industrias || []}
                                tableName="industrias"
                                onNewOption={(opt) => {
                                    setCatalogs(prev => ({
                                        ...prev,
                                        industrias: [...(prev.industrias || []), opt].sort((a, b) => a.name.localeCompare(b.name))
                                    }))
                                }}
                            />

                            {/* Ubicación */}
                            <div className='space-y-4 col-span-1 md:col-span-2 p-6 bg-[var(--hover-bg)] rounded-2xl border border-[var(--card-border)]'>
                                <label className='block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)] opacity-60'>
                                    Localización de la Empresa
                                </label>
                                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                    <div className='space-y-1.5'>
                                        <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase'>Ciudad / Estado</label>
                                        <select
                                            value={getLocationBase(formData.ubicacion)}
                                            onChange={(e) => handleLocationBaseChange(e.target.value)}
                                            className='w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                        >
                                            <option value="">Seleccionar Ciudad...</option>
                                            <option value="Monterrey">Monterrey</option>
                                            <option value="Guadalajara">Guadalajara</option>
                                            <option value="CDMX">Ciudad de México</option>
                                            <option value="Querétaro">Querétaro</option>
                                            <option value="Otra">Otra (Manual)...</option>
                                        </select>
                                    </div>

                                    {getLocationBase(formData.ubicacion) === 'Monterrey' && (
                                        <div className='space-y-1.5 animate-in fade-in slide-in-from-left-2 duration-300'>
                                            <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase'>Municipio</label>
                                            <select
                                                value={formData.ubicacion.split(', ')[1] || ''}
                                                onChange={(e) => setFormData({ ...formData, ubicacion: `Monterrey, ${e.target.value}` })}
                                                className='w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                            >
                                                <option value="">Seleccionar Municipio...</option>
                                                <option value="San Pedro Garza García">San Pedro</option>
                                                <option value="Santa Catarina">Santa Catarina</option>
                                                <option value="Monterrey">Monterrey (Centro)</option>
                                                <option value="Guadalupe">Guadalupe</option>
                                                <option value="San Nicolás">San Nicolás</option>
                                                <option value="Escobedo">Escobedo</option>
                                                <option value="Apodaca">Apodaca</option>
                                                <option value="García">García</option>
                                            </select>
                                        </div>
                                    )}

                                    {getLocationBase(formData.ubicacion) === 'Otra' && (
                                        <div className='space-y-1.5 animate-in fade-in slide-in-from-left-2 duration-300'>
                                            <label className='text-[10px] font-black text-[var(--text-secondary)] uppercase'>Especifique Ubicación</label>
                                            <input
                                                type='text'
                                                autoFocus
                                                placeholder='ej. Laredo, TX'
                                                value={formData.ubicacion === 'Otra' ? '' : formData.ubicacion}
                                                onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                                                className='w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Tamaño (Tiered Selection) */}
                            <div className='col-span-1 md:col-span-2 space-y-4 mt-2'>
                                <label className='block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)] opacity-60'>
                                    Categoría de Tamaño
                                </label>
                                <div className='grid grid-cols-2 md:grid-cols-5 gap-3'>
                                    {[
                                        { id: 1, name: 'Micro', color: '#10b981' },
                                        { id: 2, name: 'Pequeña', color: '#3b82f6' },
                                        { id: 3, name: 'Mediana', color: '#6366f1' },
                                        { id: 4, name: 'Grande', color: '#f59e0b' },
                                        { id: 5, name: 'Corporativo', color: '#8b5cf6' }
                                    ].map((tier) => (
                                        <button
                                            key={tier.id}
                                            type='button'
                                            onClick={() => setFormData({ ...formData, tamano: tier.id })}
                                            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-300 group
                                                ${formData.tamano === tier.id
                                                    ? 'border-transparent ring-2 ring-offset-2 ring-[var(--card-bg)]'
                                                    : 'border-[var(--card-border)] bg-[var(--hover-bg)] grayscale opacity-40 hover:grayscale-0 hover:opacity-100 dark:border-gray-700'
                                                }
                                            `}
                                            style={{
                                                backgroundColor: formData.tamano === tier.id ? `${tier.color}25` : '',
                                                borderColor: formData.tamano === tier.id ? tier.color : '',
                                                boxShadow: formData.tamano === tier.id ? `0 10px 15px -3px ${tier.color}30` : '',
                                                // @ts-ignore
                                                '--tw-ring-color': tier.color
                                            }}
                                        >
                                            <span
                                                className={`text-xs font-black uppercase tracking-widest transition-colors duration-300
                                                    ${formData.tamano === tier.id ? '' : 'text-[var(--text-secondary)] group-hover:scale-105'}
                                                `}
                                                style={{ color: formData.tamano === tier.id ? tier.color : undefined }}
                                            >
                                                {tier.name}
                                            </span>
                                            <span
                                                className={`text-[10px] font-bold mt-1 transition-opacity duration-300
                                                    ${formData.tamano === tier.id ? 'opacity-100' : 'text-[var(--text-secondary)] opacity-40 group-hover:opacity-100'}
                                                `}
                                                style={{ color: formData.tamano === tier.id ? tier.color : undefined }}
                                            >
                                                Nivel {tier.id}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Website */}
                            <div className='space-y-1.5'>
                                <label className='block text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)] opacity-60'>
                                    Sitio Web
                                </label>
                                <input
                                    type='text'
                                    placeholder='ej. www.ejemplo.com'
                                    value={formData.website}
                                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                    className='w-full px-4 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all'
                                />
                            </div>

                            {/* Descripción */}
                            <div className='col-span-1 md:col-span-2 space-y-1.5'>
                                <label className='block text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)] opacity-60'>
                                    Notas Adicionales
                                </label>
                                <textarea
                                    rows={3}
                                    value={formData.descripcion}
                                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                                    className='w-full px-4 py-3 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] transition-all resize-none'
                                />
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className='bg-[var(--hover-bg)] px-6 py-4 flex items-center justify-end gap-3 shrink-0 border-t border-[var(--card-border)]'>
                    <button
                        type='button'
                        onClick={onClose}
                        className='px-4 py-2 text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)] transition-colors bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow-sm hover:shadow hover:border-[var(--text-secondary)]'
                    >
                        Cancelar
                    </button>
                    <button
                        type='submit'
                        form='company-form'
                        disabled={isSubmitting || uploadingLogo}
                        className='px-6 py-2 bg-[#0A1635] text-white font-medium rounded-lg shadow-md hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95'
                    >
                        {isSubmitting ? 'Guardando...' : 'Guardar Empresa'}
                    </button>
                </div>
            </div>
            {isCropping && tempImage && (
                <ImageCropper
                    imageSrc={tempImage}
                    onCropComplete={handleConfirmCrop}
                    onCancel={() => {
                        setIsCropping(false)
                        setTempImage(null)
                    }}
                />
            )}
        </div>
    )
}
