
import { createBrowserClient } from '@supabase/ssr'

export type Database = {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    username: string | null
                    role: string | null
                    full_name: string | null
                    created_at: string
                    updated_at: string | null
                }
                Insert: {
                    id: string
                    username?: string | null
                    role?: string | null
                    full_name?: string | null
                    created_at?: string
                    updated_at?: string | null
                }
                Update: {
                    id?: string
                    username?: string | null
                    role?: string | null
                    full_name?: string | null
                    created_at?: string
                    updated_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "profiles_id_fkey"
                        columns: ["id"]
                        referencedRelation: "users"
                        referencedColumns: ["id"]
                    }
                ]
            }
            clientes: {
                Row: {
                    id: number
                    created_at: string
                    empresa: string | null
                    nombre: string | null
                    contacto: string | null
                    etapa: string | null
                    valor_estimado: number | null
                    oportunidad: string | null
                    calificacion: number | null
                    notas: string | null
                    owner_id: string | null
                    owner_username: string | null
                }
                Insert: {
                    id?: number
                    created_at?: string
                    empresa?: string | null
                    nombre?: string | null
                    contacto?: string | null
                    etapa?: string | null
                    valor_estimado?: number | null
                    oportunidad?: string | null
                    calificacion?: number | null
                    notas?: string | null
                    owner_id?: string | null
                    owner_username?: string | null
                }
                Update: {
                    id?: number
                    created_at?: string
                    empresa?: string | null
                    nombre?: string | null
                    contacto?: string | null
                    etapa?: string | null
                    valor_estimado?: number | null
                    oportunidad?: string | null
                    calificacion?: number | null
                    notas?: string | null
                    owner_id?: string | null
                    owner_username?: string | null
                }
            }
        }
    }
}

export const createClient = () =>
    createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
