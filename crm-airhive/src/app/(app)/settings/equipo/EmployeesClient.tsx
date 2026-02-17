'use client'

import { useState } from 'react'
import { UserPlus, Search, Edit2, Ban, CheckCircle, MoreHorizontal, Eye, ShieldCheck, ListFilter, RotateCw, Pencil } from 'lucide-react'
import EmployeeModal from '@/components/EmployeeModal'
import { createEmployee, updateEmployee, toggleEmployeeStatus } from '@/app/actions/employees'
import { useRouter } from 'next/navigation'

interface EmployeesClientProps {
    initialEmployees: any[]
    currentUserRole: string
}

export default function EmployeesClient({ initialEmployees, currentUserRole }: EmployeesClientProps) {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null)
    const [loadingAction, setLoadingAction] = useState<string | null>(null)

    // Filter employees locally
    const filteredEmployees = initialEmployees.filter(emp =>
        (emp.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (emp.username?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (emp.role?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    )

    const handleCreate = async (data: any) => {
        const result = await createEmployee(data)
        if (!result.success) {
            throw new Error(result.error)
        }
        router.refresh()
        return true
    }

    const handleUpdate = async (data: any) => {
        if (!selectedEmployee) return false
        const result = await updateEmployee(selectedEmployee.id, data)
        if (!result.success) {
            throw new Error(result.error)
        }
        router.refresh()
        return true
    }

    const handleToggleStatus = async (id: string, currentStatus: boolean) => {
        if (!confirm(`¿Estás seguro de que deseas ${currentStatus ? 'desactivar' : 'activar'} este usuario?`)) return

        setLoadingAction(id)
        // We assume 'active' is true unless strictly banned logic exists. 
        // For simplicity, we toggle a "banned" state in auth via action.
        // But visually, let's treat it as toggling active/inactive.
        // The action takes "banned" as boolean. So if currentStatus is active (true), we want to ban (true).
        const result = await toggleEmployeeStatus(id, !!currentStatus) // If active, ban explicitly.

        setLoadingAction(null)
        if (result.success) {
            router.refresh()
        } else {
            alert('Error: ' + result.error)
        }
    }

    return (
        <div className='space-y-10'>
            {/* External Header - Page Level */}
            <div className='flex flex-col md:flex-row md:items-center justify-between gap-6'>
                <div className='flex items-center gap-8'>
                    <div className='flex items-center gap-6'>
                        <div className='w-16 h-16 bg-[#2c313c] rounded-[22px] flex items-center justify-center border border-white/20 shadow-lg overflow-hidden transition-all hover:scale-105'>
                            <ShieldCheck size={36} color="white" strokeWidth={1.5} className="drop-shadow-sm" />
                        </div>
                        <div>
                            <h1 className='text-4xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
                                Gestión de Equipo
                            </h1>
                            <p className='font-medium' style={{ color: 'var(--text-secondary)' }}>
                                Administra los usuarios, roles y permisos del sistema.
                            </p>
                        </div>
                    </div>
                </div>

                <div className='flex items-center gap-4 p-2 rounded-2xl shadow-sm border' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <button
                        onClick={() => router.refresh()}
                        className='px-5 py-2.5 border-2 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-blue-500/10 hover:border-blue-500 hover:text-blue-500 group'
                        style={{
                            background: 'var(--card-bg)',
                            borderColor: 'var(--card-border)',
                            color: 'var(--text-primary)'
                        }}
                    >
                        <div className='flex items-center gap-2'>
                            <span>Sincronizar</span>
                            <RotateCw size={12} strokeWidth={2.5} className='transition-transform group-hover:rotate-180' />
                        </div>
                    </button>
                    <button
                        onClick={() => { setSelectedEmployee(null); setIsModalOpen(true) }}
                        className='px-8 py-3 bg-[#2048FF] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2'
                    >
                        <UserPlus size={16} />
                        Nuevo Miembro
                    </button>
                </div>
            </div>

            {/* Main Table Container */}
            <div className='rounded-[40px] shadow-xl border overflow-hidden flex flex-col mb-6' style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                <div className='px-8 py-6 border-b flex flex-col gap-6' style={{ borderColor: 'var(--card-border)' }}>
                    <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                        <div className='flex items-center gap-4'>
                            <div className='w-12 h-12 rounded-[20px] flex items-center justify-center shadow-inner' style={{ background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                <ListFilter size={24} />
                            </div>
                            <div>
                                <h2 className='text-xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>Lista de Colaboradores</h2>
                                <p className='text-[10px] font-bold uppercase tracking-[0.2em] opacity-60' style={{ color: 'var(--text-secondary)' }}>Estructura Organizacional</p>
                            </div>
                        </div>

                        <div className='flex items-center gap-3'>
                            <div className='ah-count-chip'>
                                <span className='ah-count-chip-number'>{filteredEmployees.length}</span>
                                <div className='ah-count-chip-meta'>
                                    <span className='ah-count-chip-title'>Usuarios</span>
                                    <span className='ah-count-chip-subtitle'>Activos</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className='flex flex-col lg:flex-row items-center gap-4'>
                        <div className='relative flex-1 w-full'>
                            <Search className='absolute left-4 top-1/2 -translate-y-1/2 opacity-40' style={{ color: 'var(--text-primary)' }} size={18} />
                            <input
                                type='text'
                                placeholder='Buscar por nombre, correo o rol...'
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className='w-full pl-12 pr-4 py-3.5 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-sm font-bold placeholder:text-gray-500/50 transition-all focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none shadow-sm'
                                style={{ color: 'var(--text-primary)' }}
                            />
                        </div>

                        {(searchTerm) && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className='p-2.5 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-colors shadow-sm'
                                title='Limpiar'
                            >
                                <RotateCw size={18} />
                            </button>
                        )}
                    </div>
                </div>

                <div className='flex-1 overflow-x-auto custom-scrollbar min-h-[400px]'>
                    <table className='w-full border-collapse'>
                        <thead>
                            <tr className='border-b' style={{ borderColor: 'var(--card-border)' }}>
                                <th className='px-8 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)', background: 'var(--background)' }}>Empleado</th>
                                <th className='px-8 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)', background: 'var(--background)' }}>Rol & Permisos</th>
                                <th className='px-8 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)', background: 'var(--background)' }}>Estado</th>
                                <th className='px-8 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)', background: 'var(--background)' }}>Ingreso</th>
                                <th className='px-8 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)', background: 'var(--background)' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody className='divide-y' style={{ borderColor: 'var(--card-border)' }}>
                            {filteredEmployees.map((emp) => (
                                <tr
                                    key={emp.id}
                                    onClick={() => { setSelectedEmployee(emp); setIsModalOpen(true) }}
                                    className='group hover:bg-[#2048FF]/5 transition-all cursor-pointer'
                                >
                                    <td className='px-8 py-5'>
                                        <div className='flex items-center gap-4'>
                                            <div className='w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center text-sm font-black shadow-inner' style={{ color: 'var(--text-primary)' }}>
                                                {emp.full_name ? emp.full_name.charAt(0).toUpperCase() : '?'}
                                            </div>
                                            <div>
                                                <p className='text-sm font-black truncate max-w-[200px]' style={{ color: 'var(--text-primary)' }}>{emp.full_name || 'Sin Nombre'}</p>
                                                <p className='text-[10px] font-bold opacity-50' style={{ color: 'var(--text-secondary)' }}>{emp.username || 'Sin usuario'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className='px-8 py-5'>
                                        <span className={`inline-flex items-center px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border-2
                                            ${emp.role === 'admin' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                emp.role === 'rh' ? 'bg-pink-50 text-pink-600 border-pink-100' :
                                                    'bg-blue-50 text-blue-600 border-blue-100'
                                            }`}
                                        >
                                            {emp.role || 'Sin rol'}
                                        </span>
                                    </td>
                                    <td className='px-8 py-5'>
                                        <span className='inline-flex items-center gap-2 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border-2 border-emerald-100'>
                                            <div className='w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse' />
                                            Activo
                                        </span>
                                    </td>
                                    <td className='px-8 py-5'>
                                        <p className='text-xs font-bold' style={{ color: 'var(--text-secondary)' }}>
                                            {new Date(emp.created_at).toLocaleDateString()}
                                        </p>
                                    </td>
                                    <td className='px-8 py-5 text-right'>
                                        <div className='flex items-center justify-end gap-3' onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => router.push(`/settings/equipo/${emp.id}`)}
                                                className='w-10 h-10 flex items-center justify-center bg-[var(--background)] border border-[var(--card-border)] text-[var(--text-secondary)] hover:text-[#2048FF] hover:border-[#2048FF] rounded-xl transition-all shadow-sm group/btn'
                                                title="Ver Perfil Completo"
                                            >
                                                <Eye size={18} strokeWidth={2.5} />
                                            </button>
                                            <button
                                                onClick={() => { setSelectedEmployee(emp); setIsModalOpen(true) }}
                                                className='w-10 h-10 flex items-center justify-center bg-[var(--background)] border border-[var(--card-border)] text-[var(--text-secondary)] hover:text-emerald-500 hover:border-emerald-500 rounded-xl transition-all shadow-sm'
                                                title='Editar'
                                            >
                                                <Edit2 size={16} strokeWidth={2.5} />
                                            </button>
                                            <button
                                                onClick={() => handleToggleStatus(emp.id, true)}
                                                disabled={loadingAction === emp.id}
                                                className='w-10 h-10 flex items-center justify-center bg-[var(--background)] border border-[var(--card-border)] text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500 rounded-xl transition-all shadow-sm disabled:opacity-50'
                                                title='Desactivar / Banear'
                                            >
                                                <Ban size={16} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredEmployees.length === 0 && (
                        <div className='p-20 text-center flex flex-col items-center gap-4'>
                            <div className='w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-3xl mb-2'>👥</div>
                            <p className='text-sm font-black uppercase tracking-[0.2em]' style={{ color: 'var(--text-secondary)' }}>No se encontraron colaboradores</p>
                            <button onClick={() => setSearchTerm('')} className='text-xs font-bold text-[#2048FF] border-b-2 border-transparent hover:border-[#2048FF] transition-all'>Limpiar búsqueda</button>
                        </div>
                    )}
                </div>
            </div>

            <EmployeeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={selectedEmployee ? handleUpdate : handleCreate}
                employee={selectedEmployee}
            />
        </div>
    )
}
