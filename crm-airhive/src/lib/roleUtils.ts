export type UserRole = 'admin' | 'rh' | 'seller' | string

interface RoleMeta {
    label: string
    textColor: string
    bgColor: string
    borderColor: string
}

export function getRoleMeta(role?: UserRole): RoleMeta {
    const normalizedRole = (role || '').toLowerCase()

    if (normalizedRole === 'admin') {
        return {
            label: 'Administrador',
            textColor: '#B45309',
            bgColor: 'rgba(245, 158, 11, 0.14)',
            borderColor: 'rgba(245, 158, 11, 0.42)'
        }
    }

    if (normalizedRole === 'rh') {
        return {
            label: 'Recursos Humanos',
            textColor: '#C81E8A',
            bgColor: 'rgba(200, 30, 138, 0.10)',
            borderColor: 'rgba(200, 30, 138, 0.30)'
        }
    }

    return {
        label: 'Vendedor',
        textColor: '#0F766E',
        bgColor: 'rgba(20, 184, 166, 0.10)',
        borderColor: 'rgba(20, 184, 166, 0.30)'
    }
}
