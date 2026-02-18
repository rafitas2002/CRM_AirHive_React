'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Check, ChevronsUpDown, Loader2, Trash2 } from 'lucide-react'
import { createCatalogItem, deleteCatalogItem } from '@/app/actions/catalogs'

interface Option {
    id: string
    name: string
}

interface CatalogSelectProps {
    label: string
    value: string
    onChange: (value: string) => void
    options: Option[]
    tableName: string
    onNewOption: (option: Option) => void
    onDeleteOption?: (id: string) => void
    disabled?: boolean
    canDeleteOptions?: boolean
}

export default function CatalogSelect({
    label,
    value,
    onChange,
    options,
    tableName,
    onNewOption,
    onDeleteOption,
    canDeleteOptions = false,
    disabled = false
}: CatalogSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [newItemName, setNewItemName] = useState('')
    const [loading, setLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [deleteModeEnabled, setDeleteModeEnabled] = useState(false)
    const rootRef = useRef<HTMLDivElement>(null)

    // Find selected name for display
    const selectedOption = options.find(o => o.id === value)
    const addOptionLabel = tableName === 'areas' ? 'Agregar área nueva' : 'Agregar nueva opción'

    const handleCreate = async () => {
        if (!newItemName.trim()) return

        setLoading(true)
        const result = await createCatalogItem(tableName, newItemName)
        setLoading(false)

        if (result.success && result.data) {
            onNewOption(result.data)
            onChange(result.data.id)
            setNewItemName('')
            setIsCreating(false)
            setIsOpen(false)
            setDeleteModeEnabled(false)
        } else {
            alert('Error al crear opción: ' + (result.error || 'Desconocido'))
        }
    }

    const handleDelete = async (option: Option) => {
        const confirmed = window.confirm(`¿Eliminar "${option.name}" del catálogo?`)
        if (!confirmed) return

        setDeletingId(option.id)
        const result = await (deleteCatalogItem(tableName, option.id) as Promise<{ success: boolean, error?: string, companies?: string[] }>)
        setDeletingId(null)

        if (result.success) {
            if (option.id === value) {
                onChange('')
            }
            onDeleteOption?.(option.id)
        } else {
            if (result.companies && result.companies.length > 0) {
                const previewList = result.companies.slice(0, 12).map(name => `• ${name}`).join('\n')
                const moreCount = result.companies.length > 12 ? `\n...y ${result.companies.length - 12} más.` : ''
                alert(
                    `No se puede eliminar esta industria.\n\n` +
                    `Existen empresas que están registradas con la industria que deseas borrar:\n\n` +
                    `${previewList}${moreCount}`
                )
            } else {
                alert('Error al eliminar opción: ' + (result.error || 'Desconocido'))
            }
        }
    }

    useEffect(() => {
        if (!isOpen) return

        const handleClickOutside = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setIsOpen(false)
                setIsCreating(false)
                setDeleteModeEnabled(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    return (
        <div ref={rootRef} className='relative'>
            <label className='block text-xs font-bold text-[var(--text-secondary)] uppercase mb-1'>{label}</label>

            {/* Trigger */}
            <button
                type='button'
                disabled={disabled}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg bg-[var(--input-bg)] text-sm transition-all
                    ${disabled ? 'opacity-50 cursor-not-allowed bg-[var(--background)]' : 'hover:border-[var(--text-secondary)] focus:ring-2 focus:ring-[#2048FF]'}
                    ${isOpen ? 'ring-2 ring-[#2048FF] border-transparent' : 'border-[var(--input-border)]'}
                `}
            >
                <span className={selectedOption ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
                    {selectedOption ? selectedOption.name : 'Seleccionar...'}
                </span>
                <ChevronsUpDown className='w-4 h-4 text-[var(--text-secondary)] shrink-0 opacity-50' />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className='absolute z-20 w-full mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg max-h-60 overflow-hidden flex flex-col'>
                        {/* List */}
                        {!isCreating ? (
                            <>
                                <div className='overflow-y-auto p-1 flex-1'>
                                    {options.length === 0 && (
                                        <p className='text-xs text-[var(--text-secondary)] px-3 py-2 text-center'>No hay opciones</p>
                                    )}
                                    {options.map(option => (
                                        <div
                                            key={option.id}
                                            className={`w-full flex items-center gap-2 px-1 py-0.5 rounded-lg transition-colors
                                                ${option.id === value ? 'bg-[#2048FF]/10' : 'hover:bg-[var(--hover-bg)]'}
                                            `}
                                        >
                                            <button
                                                type='button'
                                                onClick={() => { onChange(option.id); setIsOpen(false); setDeleteModeEnabled(false) }}
                                                className={`flex-1 flex items-center justify-between px-2 py-1.5 text-sm rounded-lg text-left
                                                    ${option.id === value ? 'text-[#2048FF] font-semibold' : 'text-[var(--text-primary)]'}
                                                `}
                                            >
                                                {option.name}
                                                {option.id === value && <Check size={14} />}
                                            </button>
                                            {canDeleteOptions && deleteModeEnabled && (
                                                <button
                                                    type='button'
                                                    onClick={() => handleDelete(option)}
                                                    disabled={deletingId === option.id}
                                                    className='w-8 h-8 rounded-lg flex items-center justify-center text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-50'
                                                    title={`Eliminar ${option.name}`}
                                                >
                                                    {deletingId === option.id
                                                        ? <Loader2 size={14} className='animate-spin' />
                                                        : <Trash2 size={14} />}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className='p-1 border-t border-[var(--card-border)]'>
                                    {canDeleteOptions && (
                                        <button
                                            type='button'
                                            onClick={() => setDeleteModeEnabled(prev => !prev)}
                                            className={`w-full mb-1 flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                                                deleteModeEnabled
                                                    ? 'text-rose-600 bg-rose-500/10 hover:bg-rose-500/20'
                                                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
                                            }`}
                                        >
                                            <Trash2 size={14} />
                                            {deleteModeEnabled ? 'Salir de modo eliminar' : 'Eliminar industrias...'}
                                        </button>
                                    )}
                                    <button
                                        type='button'
                                        onClick={() => setIsCreating(true)}
                                        className='w-full flex items-center gap-2 px-3 py-2 text-sm text-[#2048FF] font-semibold hover:bg-[#2048FF]/10 rounded-lg transition-colors'
                                    >
                                        <Plus size={14} />
                                        {addOptionLabel}
                                    </button>
                                </div>
                            </>
                        ) : (
                            // Create New View
                            <div className='p-3 space-y-3 bg-[var(--hover-bg)]'>
                                <p className='text-xs font-bold text-[var(--text-secondary)] uppercase'>Nueva opción para {label}</p>
                                <input
                                    autoFocus
                                    type='text'
                                    className='w-full px-2 py-1.5 text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-primary)] rounded-lg focus:ring-2 focus:ring-[#2048FF] outline-none'
                                    placeholder='Nombre...'
                                    value={newItemName}
                                    onChange={e => setNewItemName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            handleCreate()
                                        }
                                    }}
                                />
                                <div className='flex gap-2 justify-end'>
                                    <button
                                        type='button'
                                        onClick={() => setIsCreating(false)}
                                        className='px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-border)] rounded-lg'
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type='button'
                                        onClick={handleCreate}
                                        disabled={loading || !newItemName.trim()}
                                        className='px-3 py-1.5 text-xs font-bold text-white bg-[#2048FF] hover:bg-[#1700AC] rounded-lg flex items-center gap-1 disabled:opacity-50'
                                    >
                                        {loading && <Loader2 size={12} className='animate-spin' />}
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
            )}
        </div>
    )
}
