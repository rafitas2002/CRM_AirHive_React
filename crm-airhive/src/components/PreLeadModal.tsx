'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import ImageCropper from './ImageCropper'
import CatalogSelect from './CatalogSelect'
import { getCatalogs } from '@/app/actions/catalogs'

interface PreLeadModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (data: any) => void
    initialData: any
    mode: 'create' | 'edit'
}

export default function PreLeadModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    mode
}: PreLeadModalProps) {
    const [formData, setFormData] = useState({
        nombre_empresa: '',
        nombre_contacto: '',
        correos: [''],
        telefonos: [''],
        ubicacion: '',
        giro_empresa: '',
        notas: '',
        // New Company Fields
        tamano: 1,
        industria_id: '',
        industria: '',
        website: '',
        logo_url: ''
    })

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const [supabase] = useState(() => createClient())
    const [catalogs, setCatalogs] = useState<Record<string, any[]>>({})

    // Cropping state
    const [tempImage, setTempImage] = useState<string | null>(null)
    const [isCropping, setIsCropping] = useState(false)

    useEffect(() => {
        if (isOpen) {
            fetchCatalogs()
        }

        if (initialData) {
            setFormData({
                nombre_empresa: initialData.nombre_empresa || '',
                nombre_contacto: initialData.nombre_contacto || '',
                correos: initialData.correos?.length > 0 ? [...initialData.correos] : [''],
                telefonos: initialData.telefonos?.length > 0 ? [...initialData.telefonos] : [''],
                ubicacion: initialData.ubicacion || '',
                giro_empresa: initialData.giro_empresa || '',
                notas: initialData.notas || '',
                tamano: initialData.tamano || 1,
                industria_id: initialData.industria_id || '',
                industria: initialData.industria || '',
                website: initialData.website || '',
                logo_url: initialData.logo_url || ''
            })
        } else {
            setFormData({
                nombre_empresa: '',
                nombre_contacto: '',
                correos: [''],
                telefonos: [''],
                ubicacion: '',
                giro_empresa: '',
                notas: '',
                tamano: 1,
                industria_id: '',
                industria: '',
                website: '',
                logo_url: ''
            })
        }
    }, [initialData, isOpen])

    const fetchCatalogs = async () => {
        const res = await getCatalogs()
        if (res.success && res.data) {
            setCatalogs(res.data)
        }
    }

    const handleAddField = (field: 'correos' | 'telefonos') => {
        setFormData(prev => ({
            ...prev,
            [field]: [...prev[field], '']
        }))
    }

    const handleRemoveField = (field: 'correos' | 'telefonos', index: number) => {
        if (formData[field].length === 1) return
        setFormData(prev => ({
            ...prev,
            [field]: prev[field].filter((_, i) => i !== index)
        }))
    }

    const handleFieldChange = (field: 'correos' | 'telefonos', index: number, value: string) => {
        const newArr = [...formData[field]]
        newArr[index] = value
        setFormData(prev => ({ ...prev, [field]: newArr }))
    }

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return
        const file = e.target.files[0]
        const reader = new FileReader()
        reader.onload = () => {
            setTempImage(reader.result as string)
            setIsCropping(true)
        }
        reader.readAsDataURL(file)
    }

    const handleConfirmCrop = async (croppedBlob: Blob) => {
        setIsCropping(false)
        setUploadingLogo(true)
        const fileName = `${Math.random()}.png`
        try {
            const { error: uploadError } = await supabase.storage
                .from('company-logos')
                .upload(fileName, croppedBlob)
            if (uploadError) throw uploadError

            const { data } = supabase.storage.from('company-logos').getPublicUrl(fileName)
            setFormData(prev => ({ ...prev, logo_url: data.publicUrl }))
        } catch (error) {
            console.error('Error uploading logo:', error)
            alert('Error al subir el logo')
        } finally {
            setUploadingLogo(false)
            setTempImage(null)
        }
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            const cleaned = {
                ...formData,
                correos: formData.correos.filter(c => c.trim() !== ''),
                telefonos: formData.telefonos.filter(t => t.trim() !== '')
            }
            await onSave(cleaned)
        } catch (error) {
            console.error('Error in handleSave:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className='fixed inset-0 z-[100] flex items-start justify-center pt-16 pb-8 px-4 bg-black/60 backdrop-blur-sm transition-all animate-in fade-in duration-300 overflow-y-auto'>
            <div
                className='rounded-[32px] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 border'
                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
            >
                {/* Header - Unified Blue */}
                {/* Header - Unified Blue */}
                <div className='bg-[#0A1635] px-6 py-4 flex items-center justify-between shrink-0 border-b border-[var(--card-border)]'>
                    <h2 className='text-xl font-bold text-white'>
                        {mode === 'create' ? 'Nuevo Pre-Lead' : 'Editar Pre-Lead'}
                    </h2>
                    <button
                        onClick={onClose}
                        className='text-white/70 hover:text-white transition-colors'
                    >
                        ✕
                    </button>
                </div>

                {/* Form */}
                <form id="pre-lead-form" onSubmit={handleSubmit} className='flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8'>

                    {/* 🏢 Sección de Empresa */}
                    <div className='space-y-6'>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            {/* Logo Upload Section - Circular Style */}
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

                            <div className='space-y-1.5'>
                                <label className='block text-sm font-medium text-[var(--text-primary)]'>
                                    Nombre de la Empresa
                                </label>
                                <input
                                    required
                                    type="text"
                                    value={formData.nombre_empresa}
                                    onChange={(e) => setFormData({ ...formData, nombre_empresa: e.target.value })}
                                    className='w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] transition-all'
                                    placeholder="ej. Tesla Inc."
                                />
                            </div>

                            <CatalogSelect
                                label="Industria"
                                value={formData.industria_id || ''}
                                onChange={(val) => {
                                    const name = catalogs.industrias?.find(i => i.id === val)?.name || ''
                                    setFormData({ ...formData, industria_id: val, industria: name, giro_empresa: name })
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

                            {/* Ubicación - Advanced Selector */}
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
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className='col-span-1 md:col-span-2 space-y-1.5'>
                                <label className='block text-sm font-medium text-[var(--text-primary)]'>Sitio Web</label>
                                <input
                                    type="text"
                                    value={formData.website}
                                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                    className='w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] transition-all'
                                    placeholder="www.ejemplo.com"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 👤 Sección de Contacto */}
                    <div className='space-y-6 pt-4'>
                        <div className='flex items-center gap-3 border-b pb-2' style={{ borderColor: 'var(--card-border)' }}>
                            <div className='w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500'>
                                👤
                            </div>
                            <h3 className='text-xs font-black uppercase tracking-widest' style={{ color: 'var(--text-primary)' }}>Datos de Contacto</h3>
                        </div>

                        <div className='grid grid-cols-1 gap-6'>
                            <div className='space-y-2'>
                                <label className='text-[10px] font-black uppercase tracking-widest' style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Persona de Contacto</label>
                                <input
                                    type="text"
                                    value={formData.nombre_contacto}
                                    onChange={(e) => setFormData({ ...formData, nombre_contacto: e.target.value })}
                                    className='w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all'
                                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                    placeholder="Nombre completo"
                                />
                            </div>

                            <div className='space-y-4'>
                                <div className='flex items-center justify-between'>
                                    <label className='text-[10px] font-black text-blue-500 uppercase tracking-widest'>Email</label>
                                    <button type="button" onClick={() => handleAddField('correos')} className='text-[8px] font-black text-blue-500 bg-blue-500/10 px-2 py-1 rounded-lg'>+ Añadir</button>
                                </div>
                                <div className='space-y-3'>
                                    {formData.correos.map((correo, index) => (
                                        <div key={index} className='flex gap-2 animate-in slide-in-from-left-2 duration-200'>
                                            <input
                                                type="email"
                                                value={correo}
                                                onChange={(e) => handleFieldChange('correos', index, e.target.value)}
                                                className='flex-1 px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-xs transition-all'
                                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                                placeholder="correo@ejemplo.com"
                                            />
                                            {formData.correos.length > 1 && (
                                                <button type="button" onClick={() => handleRemoveField('correos', index)} className='text-rose-500 text-xs px-2'>🗑️</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className='space-y-4'>
                                <div className='flex items-center justify-between'>
                                    <label className='text-[10px] font-black text-blue-500 uppercase tracking-widest'>Teléfono</label>
                                    <button type="button" onClick={() => handleAddField('telefonos')} className='text-[8px] font-black text-blue-500 bg-blue-500/10 px-2 py-1 rounded-lg'>+ Añadir</button>
                                </div>
                                <div className='space-y-3'>
                                    {formData.telefonos.map((tel, index) => (
                                        <div key={index} className='flex gap-2 animate-in slide-in-from-left-2 duration-200'>
                                            <input
                                                type="text"
                                                value={tel}
                                                onChange={(e) => handleFieldChange('telefonos', index, e.target.value)}
                                                className='flex-1 px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-xs transition-all'
                                                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
                                                placeholder="+52 000 000 0000"
                                            />
                                            {formData.telefonos.length > 1 && (
                                                <button type="button" onClick={() => handleRemoveField('telefonos', index)} className='text-rose-500 text-xs px-2'>🗑️</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 📝 Sección de Notas */}
                    <div className='space-y-4 pt-4'>
                        <label className='block text-sm font-medium text-[var(--text-primary)]'>Notas Adicionales</label>
                        <textarea
                            rows={3}
                            value={formData.notas}
                            onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                            className='w-full px-4 py-3 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2048FF] focus:border-transparent text-sm font-bold text-[var(--text-primary)] placeholder-[var(--text-secondary)] transition-all resize-none'
                            placeholder="Detalles sobre el interés del lead..."
                        />
                    </div>
                </form>

                {/* Footer */}
                <div className='p-8 border-t flex items-center justify-end gap-3 shrink-0' style={{ background: 'var(--table-header-bg)', borderColor: 'var(--card-border)' }}>
                    <button
                        type='button'
                        onClick={onClose}
                        className='px-6 py-2 bg-transparent text-[var(--text-secondary)] rounded-xl font-bold hover:bg-[var(--hover-bg)] transition-all text-sm'
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </button>
                    <button
                        form="pre-lead-form"
                        type="submit"
                        className='px-8 py-2 bg-[#0A1635] text-white rounded-xl font-bold hover:bg-[#152955] transition-all transform active:scale-95 shadow-lg flex items-center gap-2'
                        disabled={isSubmitting || uploadingLogo}
                    >
                        {isSubmitting ? (
                            <>
                                <div className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                                <span>Guardando...</span>
                            </>
                        ) : (
                            <span>{mode === 'create' ? 'Registrar Pre-Lead' : 'Guardar Cambios'}</span>
                        )}
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
        </div >
    )
}
