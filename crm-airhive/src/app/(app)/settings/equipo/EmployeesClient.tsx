'use client'

import { useState } from 'react'
import { UserPlus, Search, Edit2, Ban, CheckCircle, MoreHorizontal, Eye } from 'lucide-react'
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
        <div className='space-y-6'>
            {/* Toolbar */}
            <div className='flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100'>
                <div className='relative w-96'>
                    <Search className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4' />
                    <input
                        type='text'
                        placeholder='Buscar por nombre, correo o rol...'
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className='w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-[#2048FF] outline-none'
                    />
                </div>
                <button
                    onClick={() => { setSelectedEmployee(null); setIsModalOpen(true) }}
                    className='px-5 py-2.5 bg-[#2048FF] hover:bg-[#1700AC] text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20'
                >
                    <UserPlus size={18} />
                    Nuevo Empleado
                </button>
            </div>

            {/* Table */}
            <div className='bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden'>
                <table className='w-full'>
                    <thead className='bg-gray-50 border-b border-gray-100'>
                        <tr>
                            <th className='px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest'>Empleado</th>
                            <th className='px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest'>Rol</th>
                            <th className='px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest'>Estado</th>
                            <th className='px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest'>Fecha Ingreso</th>
                            <th className='px-6 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest'>Acciones</th>
                        </tr>
                    </thead>
                    <tbody className='divide-y divide-gray-50'>
                        {filteredEmployees.map((emp) => (
                            <tr
                                key={emp.id}
                                onClick={() => { setSelectedEmployee(emp); setIsModalOpen(true) }}
                                className='group hover:bg-gray-50/50 transition-colors cursor-pointer'
                            >
                                <td className='px-6 py-4'>
                                    <div className='flex items-center gap-3'>
                                        <div className='w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-sm font-bold text-gray-500'>
                                            {emp.full_name ? emp.full_name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                        <div>
                                            <p className='text-sm font-bold text-[#0A1635]'>{emp.full_name || 'Sin Nombre'}</p>
                                            <p className='text-xs text-gray-400'>{emp.username || 'Sin usuario'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className='px-6 py-4'>
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold capitalize
                                        ${emp.role === 'admin' ? 'bg-purple-100 text-purple-600' :
                                            emp.role === 'rh' ? 'bg-pink-100 text-pink-600' :
                                                'bg-blue-100 text-blue-600'
                                        }`}
                                    >
                                        {emp.role || 'Sin rol'}
                                    </span>
                                </td>
                                <td className='px-6 py-4'>
                                    {/* Note: We rely on checking if user is banned or active. For now assuming active until we integrate 'banned_until' check properly in frontend props. 
                                        Since we passed raw profiles, we assume active unless marked otherwise. 
                                        If we need real status, we'd need to join with auth.users or store status in profile.
                                        For MVP, let's assume active unless we implement a specific status field in profile. 
                                    */}
                                    <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-600'>
                                        <CheckCircle size={12} />
                                        Activo
                                    </span>
                                </td>
                                <td className='px-6 py-4'>
                                    <p className='text-xs font-medium text-gray-500'>
                                        {new Date(emp.created_at).toLocaleDateString()}
                                    </p>
                                </td>
                                <td className='px-6 py-4 text-right'>
                                    <div className='flex items-center justify-end gap-2' onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => router.push(`/settings/equipo/${emp.id}`)}
                                            className='p-2 hover:bg-blue-50 bg-white text-gray-500 hover:text-[#2048FF] rounded-lg transition-all hover:scale-105 hover:shadow-md'
                                            title="Ver Perfil Completo"
                                        >
                                            <Eye size={18} />
                                        </button>
                                        <button
                                            onClick={() => { setSelectedEmployee(emp); setIsModalOpen(true) }}
                                            className='p-2 hover:bg-white bg-gray-100 text-gray-500 rounded-lg transition-all hover:scale-105 hover:shadow-md'
                                            title='Editar'
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleToggleStatus(emp.id, true)}
                                            disabled={loadingAction === emp.id}
                                            className='p-2 hover:bg-red-50 bg-gray-100 text-gray-500 hover:text-red-500 rounded-lg transition-all hover:scale-105 hover:shadow-md disabled:opacity-50'
                                            title='Desactivar / Banear'
                                        >
                                            <Ban size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredEmployees.length === 0 && (
                    <div className='p-12 text-center'>
                        <p className='text-gray-400 font-medium'>No se encontraron empleados.</p>
                    </div>
                )}
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
