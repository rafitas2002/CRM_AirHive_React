
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
                    probability_locked: boolean | null
                    next_meeting_id: string | null
                    last_snapshot_at: string | null
                    email: string | null
                    telefono: string | null
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
                    probability_locked?: boolean | null
                    next_meeting_id?: string | null
                    last_snapshot_at?: string | null
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
                    probability_locked?: boolean | null
                    next_meeting_id?: string | null
                    last_snapshot_at?: string | null
                }
            }
            pre_leads: {
                Row: {
                    id: number
                    nombre_empresa: string
                    correos: string[] | null
                    nombre_contacto: string | null
                    telefonos: string[] | null
                    ubicacion: string | null
                    giro_empresa: string | null
                    vendedor_id: string | null
                    vendedor_name: string | null
                    notas: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: number
                    nombre_empresa: string
                    correos?: string[] | null
                    nombre_contacto?: string | null
                    telefonos?: string[] | null
                    ubicacion?: string | null
                    giro_empresa?: string | null
                    vendedor_id?: string | null
                    vendedor_name?: string | null
                    notas?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: number
                    nombre_empresa?: string
                    correos?: string[] | null
                    nombre_contacto?: string | null
                    telefonos?: string[] | null
                    ubicacion?: string | null
                    giro_empresa?: string | null
                    vendedor_id?: string | null
                    vendedor_name?: string | null
                    notas?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            tareas: {
                Row: {
                    id: number
                    lead_id: number
                    titulo: string
                    descripcion: string | null
                    fecha_vencimiento: string
                    estado: 'pendiente' | 'completada' | 'atrasada' | 'cancelada'
                    prioridad: 'baja' | 'media' | 'alta'
                    vendedor_id: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: number
                    lead_id: number
                    titulo: string
                    descripcion?: string | null
                    fecha_vencimiento: string
                    estado?: 'pendiente' | 'completada' | 'atrasada' | 'cancelada'
                    prioridad?: 'baja' | 'media' | 'alta'
                    vendedor_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: number
                    lead_id?: number
                    titulo?: string
                    descripcion?: string | null
                    fecha_vencimiento?: string
                    estado?: 'pendiente' | 'completada' | 'atrasada' | 'cancelada'
                    prioridad?: 'baja' | 'media' | 'alta'
                    vendedor_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            meetings: {
                Row: {
                    id: string
                    lead_id: number
                    seller_id: string
                    title: string
                    start_time: string
                    duration_minutes: number
                    meeting_type: 'presencial' | 'llamada' | 'video'
                    notes: string | null
                    attendees: string[] | null
                    calendar_event_id: string | null
                    calendar_provider: 'google' | 'outlook' | null
                    status: 'scheduled' | 'completed' | 'cancelled'
                    meeting_status: 'scheduled' | 'held' | 'not_held' | 'pending_confirmation' | 'cancelled'
                    frozen_probability_value: number | null
                    confirmation_timestamp: string | null
                    confirmed_by: string | null
                    confirmation_notes: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    lead_id: number
                    seller_id: string
                    title: string
                    start_time: string
                    duration_minutes?: number
                    meeting_type: 'presencial' | 'llamada' | 'video'
                    notes?: string | null
                    attendees?: string[] | null
                    calendar_event_id?: string | null
                    calendar_provider?: 'google' | 'outlook' | null
                    status?: 'scheduled' | 'completed' | 'cancelled'
                    meeting_status?: 'scheduled' | 'held' | 'not_held' | 'pending_confirmation' | 'cancelled'
                    frozen_probability_value?: number | null
                    confirmation_timestamp?: string | null
                    confirmed_by?: string | null
                    confirmation_notes?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    lead_id?: number
                    seller_id?: string
                    title?: string
                    start_time?: string
                    duration_minutes?: number
                    meeting_type?: 'presencial' | 'llamada' | 'video'
                    notes?: string | null
                    attendees?: string[] | null
                    calendar_event_id?: string | null
                    calendar_provider?: 'google' | 'outlook' | null
                    status?: 'scheduled' | 'completed' | 'cancelled'
                    meeting_status?: 'scheduled' | 'held' | 'not_held' | 'pending_confirmation' | 'cancelled'
                    frozen_probability_value?: number | null
                    confirmation_timestamp?: string | null
                    confirmed_by?: string | null
                    confirmation_notes?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            meeting_alerts: {
                Row: {
                    id: string
                    meeting_id: string
                    user_id: string
                    alert_type: '24h' | '2h' | '15min' | 'overdue'
                    alert_time: string
                    sent: boolean
                    sent_at: string | null
                    dismissed: boolean
                    dismissed_at: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    meeting_id: string
                    user_id: string
                    alert_type: '24h' | '2h' | '15min' | 'overdue'
                    alert_time: string
                    sent?: boolean
                    sent_at?: string | null
                    dismissed?: boolean
                    dismissed_at?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    meeting_id?: string
                    user_id?: string
                    alert_type?: '24h' | '2h' | '15min' | 'overdue'
                    alert_time?: string
                    sent?: boolean
                    sent_at?: string | null
                    dismissed?: boolean
                    dismissed_at?: string | null
                    created_at?: string
                }
            }
            meeting_confirmations: {
                Row: {
                    id: string
                    meeting_id: string
                    confirmed_by: string
                    was_held: boolean
                    confirmation_notes: string | null
                    snapshot_created: boolean
                    snapshot_id: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    meeting_id: string
                    confirmed_by: string
                    was_held: boolean
                    confirmation_notes?: string | null
                    snapshot_created?: boolean
                    snapshot_id?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    meeting_id?: string
                    confirmed_by?: string
                    was_held?: boolean
                    confirmation_notes?: string | null
                    snapshot_created?: boolean
                    snapshot_id?: string | null
                    created_at?: string
                }
            }
            forecast_snapshots: {
                Row: {
                    id: string
                    lead_id: number
                    seller_id: string
                    meeting_id: string
                    snapshot_number: number
                    probability: number
                    snapshot_timestamp: string
                    source: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    lead_id: number
                    seller_id: string
                    meeting_id: string
                    snapshot_number: number
                    probability: number
                    snapshot_timestamp: string
                    source?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    lead_id?: number
                    seller_id?: string
                    meeting_id?: string
                    snapshot_number?: number
                    probability?: number
                    snapshot_timestamp?: string
                    source?: string
                    created_at?: string
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
            empresas: {
                Row: {
                    id: string
                    nombre: string
                    industria: string | null
                    ubicacion: string | null
                    sitio_web: string | null
                    tamano: number | null
                    owner_id: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    nombre: string
                    industria?: string | null
                    ubicacion?: string | null
                    sitio_web?: string | null
                    tamano?: number | null
                    owner_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    nombre?: string
                    industria?: string | null
                    ubicacion?: string | null
                    sitio_web?: string | null
                    tamano?: number | null
                    owner_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            google_integrations: {
                Row: {
                    id: string
                    user_id: string
                    email: string
                    access_token: string
                    refresh_token: string
                    expires_at: string
                    scope: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    email: string
                    access_token: string
                    refresh_token: string
                    expires_at: string
                    scope: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    email?: string
                    access_token?: string
                    refresh_token?: string
                    expires_at?: string
                    scope?: string
                    created_at?: string
                    updated_at?: string
                }
            }
            race_results: {
                Row: {
                    id: string
                    period: string
                    user_id: string
                    total_sales: number
                    rank: number
                    medal: 'gold' | 'silver' | 'bronze' | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    period: string
                    user_id: string
                    total_sales?: number
                    rank?: number
                    medal?: 'gold' | 'silver' | 'bronze' | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    period?: string
                    user_id?: string
                    total_sales?: number
                    rank?: number
                    medal?: 'gold' | 'silver' | 'bronze' | null
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
