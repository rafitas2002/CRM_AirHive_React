'use client'

import { useState } from 'react'
import { Plus, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { createCatalogItem } from '@/app/actions/catalogs'

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
    disabled?: boolean
}

export default function CatalogSelect({
    label,
    value,
    onChange,
    options,
    tableName,
    onNewOption,
    disabled = false
}: CatalogSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [newItemName, setNewItemName] = useState('')
    const [loading, setLoading] = useState(false)

    // Find selected name for display
    const selectedOption = options.find(o => o.id === value)

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
        } else {
            alert('Error al crear opción: ' + (result.error || 'Desconocido'))
        }
    }

    return (
        <div className='relative'>
            <label className='block text-xs font-bold text-gray-500 uppercase mb-1'>{label}</label>

            {/* Trigger */}
            <button
                type='button'
                disabled={disabled}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg bg-white text-sm transition-all
                    ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:border-gray-400 focus:ring-2 focus:ring-[#2048FF]'}
                    ${isOpen ? 'ring-2 ring-[#2048FF] border-transparent' : 'border-gray-200'}
                `}
            >
                <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
                    {selectedOption ? selectedOption.name : 'Seleccionar...'}
                </span>
                <ChevronsUpDown className='w-4 h-4 text-gray-400 shrink-0 opacity-50' />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    <div
                        className='fixed inset-0 z-10'
                        onClick={() => { setIsOpen(false); setIsCreating(false); }}
                    />
                    <div className='absolute z-20 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-hidden flex flex-col'>
                        {/* List */}
                        {!isCreating ? (
                            <>
                                <div className='overflow-y-auto p-1 flex-1'>
                                    {options.length === 0 && (
                                        <p className='text-xs text-gray-400 px-3 py-2 text-center'>No hay opciones</p>
                                    )}
                                    {options.map(option => (
                                        <button
                                            key={option.id}
                                            type='button'
                                            onClick={() => { onChange(option.id); setIsOpen(false); }}
                                            className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-gray-50 transition-colors
                                                ${option.id === value ? 'bg-blue-50 text-[#2048FF] font-semibold' : 'text-gray-700'}
                                            `}
                                        >
                                            {option.name}
                                            {option.id === value && <Check size={14} />}
                                        </button>
                                    ))}
                                </div>
                                <div className='p-1 border-t border-gray-50'>
                                    <button
                                        type='button'
                                        onClick={() => setIsCreating(true)}
                                        className='w-full flex items-center gap-2 px-3 py-2 text-sm text-[#2048FF] font-semibold hover:bg-blue-50 rounded-lg transition-colors'
                                    >
                                        <Plus size={14} />
                                        Agregar nueva opción
                                    </button>
                                </div>
                            </>
                        ) : (
                            // Create New View
                            <div className='p-3 space-y-3 bg-gray-50'>
                                <p className='text-xs font-bold text-gray-500 uppercase'>Nueva opción para {label}</p>
                                <input
                                    autoFocus
                                    type='text'
                                    className='w-full px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-[#2048FF] outline-none'
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
                                        className='px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-200 rounded-lg'
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
                </>
            )}
        </div>
    )
}
