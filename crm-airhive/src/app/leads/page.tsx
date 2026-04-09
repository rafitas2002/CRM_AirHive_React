import { redirect } from 'next/navigation'

export default function LeadsPage() {
    redirect('/empresas?view=leads')
}
