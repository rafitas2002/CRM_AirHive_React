
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
                    empresa_id: string | null
                    fecha_registro: string
                    forecast_logloss: number | null
                    forecast_evaluated_probability: number | null
                    forecast_outcome: number | null
                    forecast_scored_at: string | null
                    probabilidad: number | null
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
                    empresa_id?: string | null
                    fecha_registro?: string
                    forecast_logloss?: number | null
                    forecast_evaluated_probability?: number | null
                    forecast_outcome?: number | null
                    forecast_scored_at?: string | null
                    probabilidad?: number | null
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
                    empresa_id?: string | null
                    fecha_registro?: string
                    forecast_logloss?: number | null
                    forecast_evaluated_probability?: number | null
                    forecast_outcome?: number | null
                    forecast_scored_at?: string | null
                    probabilidad?: number | null
                }
            }
            lead_history: {
                Row: {
                    id: number
                    lead_id: number | null
                    changed_by: string | null
                    field_name: string
                    old_value: string | null
                    new_value: string | null
                    created_at: string
                }
                Insert: {
                    id?: number
                    lead_id?: number | null
                    changed_by?: string | null
                    field_name: string
                    old_value?: string | null
                    new_value?: string | null
                    created_at?: string
                }
                Update: {
                    id?: number
                    lead_id?: number | null
                    changed_by?: string | null
                    field_name?: string
                    old_value?: string | null
                    new_value?: string | null
                    created_at?: string
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
