
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
                    valor_real_cierre: number | null
                    valor_implementacion_estimado: number | null
                    valor_implementacion_real_cierre: number | null
                    value_forecast_estimated: number | null
                    value_forecast_actual: number | null
                    implementation_forecast_estimated: number | null
                    implementation_forecast_actual: number | null
                    implementation_forecast_abs_error: number | null
                    implementation_forecast_pct_error: number | null
                    implementation_forecast_scored_at: string | null
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
                    forecast_close_date: string | null
                    close_date_forecast_estimated: string | null
                    close_date_forecast_actual: string | null
                    close_date_forecast_days_error: number | null
                    close_date_forecast_abs_days_error: number | null
                    close_date_forecast_score: number | null
                    close_date_forecast_scored_at: string | null
                    probability_locked: boolean | null
                    next_meeting_id: string | null
                    last_snapshot_at: string | null
                    email: string | null
                    telefono: string | null
                    original_pre_lead_id: number | null
                    original_vendedor_id: string | null
                    converted_at: string | null
                    converted_by: string | null
                    closed_at_real: string | null
                    prospect_role_catalog_id: string | null
                    prospect_role_custom: string | null
                    prospect_role_exact_title: string | null
                    prospect_age_exact: number | null
                    prospect_age_range_id: string | null
                    prospect_decision_role: 'decision_maker' | 'influencer' | 'evaluator' | 'user' | 'gatekeeper' | 'unknown' | null
                    prospect_preferred_contact_channel: 'whatsapp' | 'llamada' | 'email' | 'video' | 'presencial' | 'sin_preferencia' | null
                    prospect_linkedin_url: string | null
                    prospect_is_family_member: boolean | null
                }
                Insert: {
                    id?: number
                    created_at?: string
                    empresa?: string | null
                    nombre?: string | null
                    contacto?: string | null
                    etapa?: string | null
                    valor_estimado?: number | null
                    valor_real_cierre?: number | null
                    valor_implementacion_estimado?: number | null
                    valor_implementacion_real_cierre?: number | null
                    value_forecast_estimated?: number | null
                    value_forecast_actual?: number | null
                    implementation_forecast_estimated?: number | null
                    implementation_forecast_actual?: number | null
                    implementation_forecast_abs_error?: number | null
                    implementation_forecast_pct_error?: number | null
                    implementation_forecast_scored_at?: string | null
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
                    forecast_close_date?: string | null
                    close_date_forecast_estimated?: string | null
                    close_date_forecast_actual?: string | null
                    close_date_forecast_days_error?: number | null
                    close_date_forecast_abs_days_error?: number | null
                    close_date_forecast_score?: number | null
                    close_date_forecast_scored_at?: string | null
                    probability_locked?: boolean | null
                    next_meeting_id?: string | null
                    last_snapshot_at?: string | null
                    email?: string | null
                    telefono?: string | null
                    original_pre_lead_id?: number | null
                    original_vendedor_id?: string | null
                    converted_at?: string | null
                    converted_by?: string | null
                    closed_at_real?: string | null
                    prospect_role_catalog_id?: string | null
                    prospect_role_custom?: string | null
                    prospect_role_exact_title?: string | null
                    prospect_age_exact?: number | null
                    prospect_age_range_id?: string | null
                    prospect_decision_role?: 'decision_maker' | 'influencer' | 'evaluator' | 'user' | 'gatekeeper' | 'unknown' | null
                    prospect_preferred_contact_channel?: 'whatsapp' | 'llamada' | 'email' | 'video' | 'presencial' | 'sin_preferencia' | null
                    prospect_linkedin_url?: string | null
                    prospect_is_family_member?: boolean | null
                }
                Update: {
                    id?: number
                    created_at?: string
                    empresa?: string | null
                    nombre?: string | null
                    contacto?: string | null
                    etapa?: string | null
                    valor_estimado?: number | null
                    valor_real_cierre?: number | null
                    valor_implementacion_estimado?: number | null
                    valor_implementacion_real_cierre?: number | null
                    value_forecast_estimated?: number | null
                    value_forecast_actual?: number | null
                    implementation_forecast_estimated?: number | null
                    implementation_forecast_actual?: number | null
                    implementation_forecast_abs_error?: number | null
                    implementation_forecast_pct_error?: number | null
                    implementation_forecast_scored_at?: string | null
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
                    forecast_close_date?: string | null
                    close_date_forecast_estimated?: string | null
                    close_date_forecast_actual?: string | null
                    close_date_forecast_days_error?: number | null
                    close_date_forecast_abs_days_error?: number | null
                    close_date_forecast_score?: number | null
                    close_date_forecast_scored_at?: string | null
                    probability_locked?: boolean | null
                    next_meeting_id?: string | null
                    last_snapshot_at?: string | null
                    email?: string | null
                    telefono?: string | null
                    original_pre_lead_id?: number | null
                    original_vendedor_id?: string | null
                    converted_at?: string | null
                    converted_by?: string | null
                    closed_at_real?: string | null
                    prospect_role_catalog_id?: string | null
                    prospect_role_custom?: string | null
                    prospect_role_exact_title?: string | null
                    prospect_age_exact?: number | null
                    prospect_age_range_id?: string | null
                    prospect_decision_role?: 'decision_maker' | 'influencer' | 'evaluator' | 'user' | 'gatekeeper' | 'unknown' | null
                    prospect_preferred_contact_channel?: 'whatsapp' | 'llamada' | 'email' | 'video' | 'presencial' | 'sin_preferencia' | null
                    prospect_linkedin_url?: string | null
                    prospect_is_family_member?: boolean | null
                }
            }
            lead_user_assignments: {
                Row: {
                    id: string
                    lead_id: number
                    user_id: string
                    is_primary: boolean
                    assigned_by: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    lead_id: number
                    user_id: string
                    is_primary?: boolean
                    assigned_by?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    lead_id?: number
                    user_id?: string
                    is_primary?: boolean
                    assigned_by?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            lead_prospect_roles_catalog: {
                Row: {
                    id: string
                    code: string
                    label: string
                    description: string | null
                    sort_order: number
                    is_active: boolean
                    created_by: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    code: string
                    label: string
                    description?: string | null
                    sort_order?: number
                    is_active?: boolean
                    created_by?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    code?: string
                    label?: string
                    description?: string | null
                    sort_order?: number
                    is_active?: boolean
                    created_by?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            lead_age_ranges_catalog: {
                Row: {
                    id: string
                    code: string
                    label: string
                    min_age: number | null
                    max_age: number | null
                    sort_order: number
                    is_active: boolean
                    created_by: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    code: string
                    label: string
                    min_age?: number | null
                    max_age?: number | null
                    sort_order?: number
                    is_active?: boolean
                    created_by?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    code?: string
                    label?: string
                    min_age?: number | null
                    max_age?: number | null
                    sort_order?: number
                    is_active?: boolean
                    created_by?: string | null
                    created_at?: string
                    updated_at?: string
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
                    is_converted: boolean
                    empresa_id: string | null
                    industria_id: string | null
                    tamano: number | null
                    website: string | null
                    logo_url: string | null
                    converted_at: string | null
                    converted_by: string | null
                    lead_origin: 'contacto_propio' | 'referido' | 'inbound_marketing' | 'outbound_prospeccion' | 'evento_networking' | 'alianza_partner' | 'base_datos' | 'visita_puerta_fria' | 'cliente_existente' | 'otro' | 'sin_definir' | null
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
                    is_converted?: boolean
                    empresa_id?: string | null
                    industria_id?: string | null
                    tamano?: number | null
                    website?: string | null
                    logo_url?: string | null
                    converted_at?: string | null
                    converted_by?: string | null
                    lead_origin?: 'contacto_propio' | 'referido' | 'inbound_marketing' | 'outbound_prospeccion' | 'evento_networking' | 'alianza_partner' | 'base_datos' | 'visita_puerta_fria' | 'cliente_existente' | 'otro' | 'sin_definir' | null
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
                    is_converted?: boolean
                    empresa_id?: string | null
                    industria_id?: string | null
                    tamano?: number | null
                    website?: string | null
                    logo_url?: string | null
                    converted_at?: string | null
                    converted_by?: string | null
                    lead_origin?: 'contacto_propio' | 'referido' | 'inbound_marketing' | 'outbound_prospeccion' | 'evento_networking' | 'alianza_partner' | 'base_datos' | 'visita_puerta_fria' | 'cliente_existente' | 'otro' | 'sin_definir' | null
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
                    meeting_sequence_number: number | null
                    start_time: string
                    duration_minutes: number
                    meeting_type: 'presencial' | 'visita_empresa' | 'llamada' | 'video'
                    notes: string | null
                    attendees: string[] | null
                    primary_company_contact_id: string | null
                    primary_company_contact_name: string | null
                    external_participants: string[] | null
                    calendar_event_id: string | null
                    calendar_provider: 'google' | 'outlook' | null
                    status: 'scheduled' | 'completed' | 'cancelled'
                    meeting_status: 'scheduled' | 'held' | 'not_held' | 'pending_confirmation' | 'cancelled'
                    frozen_probability_value: number | null
                    confirmation_timestamp: string | null
                    confirmed_by: string | null
                    confirmation_notes: string | null
                    not_held_reason: string | null
                    not_held_reason_id: string | null
                    not_held_responsibility: 'propia' | 'ajena' | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    lead_id: number
                    seller_id: string
                    title: string
                    meeting_sequence_number?: number | null
                    start_time: string
                    duration_minutes?: number
                    meeting_type: 'presencial' | 'visita_empresa' | 'llamada' | 'video'
                    notes?: string | null
                    attendees?: string[] | null
                    primary_company_contact_id?: string | null
                    primary_company_contact_name?: string | null
                    external_participants?: string[] | null
                    calendar_event_id?: string | null
                    calendar_provider?: 'google' | 'outlook' | null
                    status?: 'scheduled' | 'completed' | 'cancelled'
                    meeting_status?: 'scheduled' | 'held' | 'not_held' | 'pending_confirmation' | 'cancelled'
                    frozen_probability_value?: number | null
                    confirmation_timestamp?: string | null
                    confirmed_by?: string | null
                    confirmation_notes?: string | null
                    not_held_reason?: string | null
                    not_held_reason_id?: string | null
                    not_held_responsibility?: 'propia' | 'ajena' | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    lead_id?: number
                    seller_id?: string
                    title?: string
                    meeting_sequence_number?: number | null
                    start_time?: string
                    duration_minutes?: number
                    meeting_type?: 'presencial' | 'visita_empresa' | 'llamada' | 'video'
                    notes?: string | null
                    attendees?: string[] | null
                    primary_company_contact_id?: string | null
                    primary_company_contact_name?: string | null
                    external_participants?: string[] | null
                    calendar_event_id?: string | null
                    calendar_provider?: 'google' | 'outlook' | null
                    status?: 'scheduled' | 'completed' | 'cancelled'
                    meeting_status?: 'scheduled' | 'held' | 'not_held' | 'pending_confirmation' | 'cancelled'
                    frozen_probability_value?: number | null
                    confirmation_timestamp?: string | null
                    confirmed_by?: string | null
                    confirmation_notes?: string | null
                    not_held_reason?: string | null
                    not_held_reason_id?: string | null
                    not_held_responsibility?: 'propia' | 'ajena' | null
                    created_at?: string
                    updated_at?: string
                }
            }
            meeting_cancellation_reasons: {
                Row: {
                    id: string
                    code: string
                    label: string
                    description: string | null
                    is_active: boolean
                    is_default: boolean
                    sort_order: number
                    created_by: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    code: string
                    label: string
                    description?: string | null
                    is_active?: boolean
                    is_default?: boolean
                    sort_order?: number
                    created_by?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    code?: string
                    label?: string
                    description?: string | null
                    is_active?: boolean
                    is_default?: boolean
                    sort_order?: number
                    created_by?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            company_contacts: {
                Row: {
                    id: string
                    empresa_id: string
                    full_name: string
                    email: string | null
                    phone: string | null
                    job_title: string | null
                    is_primary: boolean
                    is_active: boolean
                    source: 'manual' | 'lead_sync'
                    created_by: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    empresa_id: string
                    full_name: string
                    email?: string | null
                    phone?: string | null
                    job_title?: string | null
                    is_primary?: boolean
                    is_active?: boolean
                    source?: 'manual' | 'lead_sync'
                    created_by?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    empresa_id?: string
                    full_name?: string
                    email?: string | null
                    phone?: string | null
                    job_title?: string | null
                    is_primary?: boolean
                    is_active?: boolean
                    source?: 'manual' | 'lead_sync'
                    created_by?: string | null
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
                    not_held_reason: string | null
                    not_held_reason_id: string | null
                    not_held_responsibility: 'propia' | 'ajena' | null
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
                    not_held_reason?: string | null
                    not_held_reason_id?: string | null
                    not_held_responsibility?: 'propia' | 'ajena' | null
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
                    not_held_reason?: string | null
                    not_held_reason_id?: string | null
                    not_held_responsibility?: 'propia' | 'ajena' | null
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
                    forecast_value_amount: number | null
                    forecast_implementation_amount: number | null
                    forecast_close_date: string | null
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
                    forecast_value_amount?: number | null
                    forecast_implementation_amount?: number | null
                    forecast_close_date?: string | null
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
                    forecast_value_amount?: number | null
                    forecast_implementation_amount?: number | null
                    forecast_close_date?: string | null
                    snapshot_timestamp?: string
                    source?: string
                    created_at?: string
                }
            }
            lead_close_date_forecast_snapshots: {
                Row: {
                    id: string
                    lead_id: number
                    seller_id: string | null
                    estimated_close_date: string
                    actual_close_date: string
                    days_error: number
                    abs_days_error: number
                    score: number
                    source: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    lead_id: number
                    seller_id?: string | null
                    estimated_close_date: string
                    actual_close_date: string
                    days_error: number
                    abs_days_error: number
                    score: number
                    source?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    lead_id?: number
                    seller_id?: string | null
                    estimated_close_date?: string
                    actual_close_date?: string
                    days_error?: number
                    abs_days_error?: number
                    score?: number
                    source?: string
                    created_at?: string
                }
            }
            lead_implementation_forecast_snapshots: {
                Row: {
                    id: string
                    lead_id: number
                    seller_id: string | null
                    estimated_value: number
                    actual_value: number
                    abs_error: number
                    pct_error: number | null
                    source: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    lead_id: number
                    seller_id?: string | null
                    estimated_value: number
                    actual_value: number
                    abs_error: number
                    pct_error?: number | null
                    source?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    lead_id?: number
                    seller_id?: string | null
                    estimated_value?: number
                    actual_value?: number
                    abs_error?: number
                    pct_error?: number | null
                    source?: string
                    created_at?: string
                }
            }
            seller_forecast_reliability_metrics: {
                Row: {
                    seller_id: string
                    probability_reliability_score: number
                    probability_reliability_samples: number
                    probability_bias_pct_signed: number
                    value_reliability_score: number
                    value_reliability_samples: number
                    value_bias_pct_signed: number
                    value_mape_pct: number
                    implementation_reliability_score: number
                    implementation_reliability_samples: number
                    implementation_bias_pct_signed: number
                    implementation_mape_pct: number
                    close_date_reliability_score: number
                    close_date_reliability_samples: number
                    close_date_bias_days_signed: number
                    close_date_mae_days: number
                    model_version: string
                    last_recomputed_at: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    seller_id: string
                    probability_reliability_score?: number
                    probability_reliability_samples?: number
                    probability_bias_pct_signed?: number
                    value_reliability_score?: number
                    value_reliability_samples?: number
                    value_bias_pct_signed?: number
                    value_mape_pct?: number
                    implementation_reliability_score?: number
                    implementation_reliability_samples?: number
                    implementation_bias_pct_signed?: number
                    implementation_mape_pct?: number
                    close_date_reliability_score?: number
                    close_date_reliability_samples?: number
                    close_date_bias_days_signed?: number
                    close_date_mae_days?: number
                    model_version?: string
                    last_recomputed_at?: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    seller_id?: string
                    probability_reliability_score?: number
                    probability_reliability_samples?: number
                    probability_bias_pct_signed?: number
                    value_reliability_score?: number
                    value_reliability_samples?: number
                    value_bias_pct_signed?: number
                    value_mape_pct?: number
                    implementation_reliability_score?: number
                    implementation_reliability_samples?: number
                    implementation_bias_pct_signed?: number
                    implementation_mape_pct?: number
                    close_date_reliability_score?: number
                    close_date_reliability_samples?: number
                    close_date_bias_days_signed?: number
                    close_date_mae_days?: number
                    model_version?: string
                    last_recomputed_at?: string
                    created_at?: string
                    updated_at?: string
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
                    email: string | null
                    tamano: number | null
                    owner_id: string | null
                    industria_id: string | null
                    tags: string[]
                    lead_origin: 'contacto_propio' | 'referido' | 'inbound_marketing' | 'outbound_prospeccion' | 'evento_networking' | 'alianza_partner' | 'base_datos' | 'visita_puerta_fria' | 'cliente_existente' | 'otro' | 'sin_definir' | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    nombre: string
                    industria?: string | null
                    ubicacion?: string | null
                    sitio_web?: string | null
                    email?: string | null
                    tamano?: number | null
                    owner_id?: string | null
                    industria_id?: string | null
                    tags?: string[]
                    lead_origin?: 'contacto_propio' | 'referido' | 'inbound_marketing' | 'outbound_prospeccion' | 'evento_networking' | 'alianza_partner' | 'base_datos' | 'visita_puerta_fria' | 'cliente_existente' | 'otro' | 'sin_definir' | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    nombre?: string
                    industria?: string | null
                    ubicacion?: string | null
                    sitio_web?: string | null
                    email?: string | null
                    tamano?: number | null
                    owner_id?: string | null
                    industria_id?: string | null
                    tags?: string[]
                    lead_origin?: 'contacto_propio' | 'referido' | 'inbound_marketing' | 'outbound_prospeccion' | 'evento_networking' | 'alianza_partner' | 'base_datos' | 'visita_puerta_fria' | 'cliente_existente' | 'otro' | 'sin_definir' | null
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
            industrias: {
                Row: {
                    id: string
                    name: string
                    is_active: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    is_active?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    is_active?: boolean
                    created_at?: string
                }
            }
            badge_level_config: {
                Row: {
                    id: number
                    level: number
                    min_closures: number
                    created_at: string
                }
                Insert: {
                    id?: number
                    level: number
                    min_closures: number
                    created_at?: string
                }
                Update: {
                    id?: number
                    level?: number
                    min_closures?: number
                    created_at?: string
                }
            }
            company_industries: {
                Row: {
                    id: string
                    empresa_id: string
                    industria_id: string
                    is_primary: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    empresa_id: string
                    industria_id: string
                    is_primary?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    empresa_id?: string
                    industria_id?: string
                    is_primary?: boolean
                    created_at?: string
                }
            }
            seller_badge_closures: {
                Row: {
                    id: string
                    lead_id: number
                    seller_id: string
                    empresa_id: string
                    closed_at: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    lead_id: number
                    seller_id: string
                    empresa_id: string
                    closed_at?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    lead_id?: number
                    seller_id?: string
                    empresa_id?: string
                    closed_at?: string
                    created_at?: string
                }
            }
            seller_industry_badges: {
                Row: {
                    id: string
                    seller_id: string
                    industria_id: string
                    closures_count: number
                    level: number
                    next_level_threshold: number | null
                    unlocked_at: string | null
                    updated_at: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    seller_id: string
                    industria_id: string
                    closures_count?: number
                    level?: number
                    next_level_threshold?: number | null
                    unlocked_at?: string | null
                    updated_at?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    seller_id?: string
                    industria_id?: string
                    closures_count?: number
                    level?: number
                    next_level_threshold?: number | null
                    unlocked_at?: string | null
                    updated_at?: string
                    created_at?: string
                }
            }
            seller_badge_events: {
                Row: {
                    id: string
                    seller_id: string
                    industria_id: string
                    level: number
                    event_type: 'unlocked' | 'upgraded'
                    closures_count: number
                    source_lead_id: number | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    seller_id: string
                    industria_id: string
                    level: number
                    event_type: 'unlocked' | 'upgraded'
                    closures_count: number
                    source_lead_id?: number | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    seller_id?: string
                    industria_id?: string
                    level?: number
                    event_type?: 'unlocked' | 'upgraded'
                    closures_count?: number
                    source_lead_id?: number | null
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
