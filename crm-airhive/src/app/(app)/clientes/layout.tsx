import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

type ClientesLegacyLayoutProps = {
    children: ReactNode
}

export default function ClientesLegacyLayout({ children }: ClientesLegacyLayoutProps) {
    void children
    redirect('/empresas?view=leads')
}
