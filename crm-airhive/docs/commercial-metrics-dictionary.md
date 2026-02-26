# Diccionario de Métricas Comercial (AirHive CRM)

Documento oficial de definiciones de KPIs comerciales para evitar inconsistencias entre:
- `home` (dashboard ejecutivo)
- `/cierres` (analytics de pérdidas)
- `/clientes` (aging de negociaciones)
- futuros reportes / badges / scorecards

Actualizado: `2026-02-25`  
Versión técnica de referencia: `src/lib/metricsDefinitions.ts`

## Reglas de Gobierno
- Una métrica solo puede cambiar si se actualiza este documento **y** `src/lib/metricsDefinitions.ts`.
- El periodo y la fecha de referencia deben estar explícitos (`closed_at_real`, `loss_recorded_at`, etc.).
- Si una pantalla usa una variante, debe declararla como una métrica distinta (no reutilizar nombre).
- Owner de negocio (`Dirección Comercial`) define semántica; `Administración CRM` asegura consistencia técnica.

## KPIs Ejecutivos (Home)

### `active_companies` — Empresas activas
- Definición de negocio: Empresas con al menos un proyecto implementado real registrado.
- Fórmula: `COUNT(DISTINCT empresa_id)` en `empresa_proyecto_asignaciones` con `assignment_stage = 'implemented_real'`.
- Fuente: `empresa_proyecto_asignaciones`.
- Periodo: estado actual (sin filtro temporal).
- Excluye: empresas con solo leads y sin proyectos implementados reales.
- Owner: Dirección Comercial.

### `monthly_won_closures` — Cierres del mes
- Definición de negocio: Leads cerrados ganados con fecha real de cierre en el mes.
- Fórmula: `COUNT(*)` de `clientes` en etapa `Cerrado Ganado` con `closed_at_real` en el mes (UTC).
- Fuente: `clientes`.
- Periodo: mes actual por `closed_at_real`.
- Excluye: ganados sin `closed_at_real`, cerrados perdidos.
- Owner: Dirección Comercial.

### `adjusted_forecast_amount` — Forecast ajustado
- Definición de negocio: Estimación mensual de negociación ajustada por confiabilidad histórica.
- Fórmula: `SUM(computeAdjustedMonthlyRaceLeadValue(...))` sobre leads en `Negociación`.
- Fuente: `clientes`, `seller_forecast_reliability_metrics`, helper de forecast.
- Periodo: mes actual (según helper y `forecast_close_date`).
- Excluye: cerrados y leads fuera de negociación (en cálculo actual del `home` admin).
- Owner: Dirección Comercial.

### `monthly_conversion_rate` — Tasa de conversión
- Definición de negocio: Porcentaje de cierres ganados sobre decisiones de cierre.
- Fórmula: `ganados / (ganados + perdidos) * 100`.
- Fuente: `clientes`.
- Periodo: mes actual por `closed_at_real`.
- Excluye: leads abiertos, cierres sin fecha real.
- Owner: Dirección Comercial.

### `avg_cycle_days_won` — Ciclo promedio
- Definición de negocio: Días promedio desde alta del lead hasta cierre ganado.
- Fórmula: `AVG(closed_at_real - (fecha_registro || created_at))`.
- Fuente: `clientes`.
- Periodo: se filtra por ganados del mes (`closed_at_real`).
- Excluye: perdidos y registros con fechas inválidas/faltantes.
- Owner: Dirección Comercial.

### `sellers_at_risk_7d` — Vendedores en riesgo (7d)
- Definición de negocio: Vendedores sin actividad operativa registrada en los últimos 7 días.
- Fórmula: `COUNT(sellers)` cuyo último `crm_event` operativo < `now() - 7 días`.
- Fuente: `crm_events`, `profiles`, apoyo de `clientes`.
- Periodo: ventana móvil de 7 días.
- Excluye: usuarios fuera de rol comercial y cuentas no elegibles.
- Owner: Dirección Comercial.

## Analytics de Pérdidas (`/cierres`)

### `loss_lost_count` — Cierres perdidos
- Definición de negocio: Conteo de leads perdidos con el filtro actual.
- Fórmula: `COUNT(rows)` en `lead_loss_analytics_view` / `lead_loss_analytics_enriched_view`.
- Fecha de referencia: `closed_at_real`, con fallback a `loss_recorded_at`, `fecha_registro`, `created_at` según la lógica del módulo.
- Owner: Dirección Comercial.

### `loss_monthly_value` — Monto perdido (mensualidad)
- Definición de negocio: Suma del valor mensual estimado perdido.
- Fórmula: `SUM(valor_estimado)` sobre pérdidas filtradas.
- Fuente: `lead_loss_analytics_*`.
- Owner: Dirección Comercial.

### `loss_implementation_value` — Monto perdido (implementación)
- Definición de negocio: Suma de la implementación estimada perdida.
- Fórmula: `SUM(valor_implementacion_estimado)` sobre pérdidas filtradas.
- Fuente: `lead_loss_analytics_*`.
- Owner: Dirección Comercial.

### `loss_total_estimated_value` — Total estimado perdido
- Definición de negocio: Impacto económico estimado total de pérdidas.
- Fórmula: `SUM(valor_estimado + valor_implementacion_estimado)` sobre pérdidas filtradas.
- Fuente: `lead_loss_analytics_*`.
- Owner: Dirección Comercial.

### `loss_top_reason` — Motivo principal
- Definición de negocio: Motivo de pérdida más frecuente bajo el filtro actual.
- Fórmula: `TOP 1` por `COUNT` agrupando por `loss_reason`.
- Fuente: `lead_loss_analytics_*`.
- Nota: puede devolver `Sin clasificar` si domina la captura incompleta.
- Owner: Dirección Comercial.

### `loss_unclassified_pct` — % sin clasificar
- Definición de negocio: Calidad de captura de pérdidas estructuradas.
- Fórmula: `COUNT(loss_reason_id IS NULL OR loss_subreason_id IS NULL) / COUNT(*) * 100`.
- Fuente: `lead_loss_analytics_*`.
- Owner: Administración CRM.

### `loss_avg_cycle_days` — Ciclo promedio perdido
- Definición de negocio: Días promedio desde alta del lead hasta pérdida.
- Fórmula: `AVG(fecha pérdida referencia - fecha_registro|created_at)`.
- Fuente: `lead_loss_analytics_*`.
- Owner: Dirección Comercial.

## Aging de Negociaciones (`/clientes`)

### `negotiation_aging_days` — Aging de negociación
- Definición de negocio: Días que un lead lleva en `Negociación`.
- Fórmula: `CURRENT_DATE - negotiation_started_at`.
- Fuente: `lead_negotiation_aging_view`, `clientes`, `lead_history` (backfill).
- Owner: Dirección Comercial.

### `negotiation_stalled_count` — Negociaciones atoradas
- Definición de negocio: Conteo de negociaciones estancadas con la regla operativa vigente.
- Regla MVP actual: `aging >= 14d`, `>= 7d sin actividad`, `sin próxima junta`, `sin tareas pendientes`.
- Fuente: `lead_negotiation_aging_view`.
- Owner: Dirección Comercial.

## Calidad de Pipeline

### `pipeline_missing_estimated_value_count` — Leads sin valor estimado
- Definición de negocio: Leads activos sin `valor_estimado`.
- Uso: señal de calidad de captura / impacto en forecast.
- Fuente: `clientes`.
- Owner: Administración CRM.

## Cómo usar este diccionario en código
- Fuente central: `src/lib/metricsDefinitions.ts`
- UI (`home`, `/cierres`, `/clientes`): usar labels y `shortHelp` desde el diccionario.
- Nuevos dashboards/reportes: agregar el KPI aquí antes de publicarlo.
- Si cambias fórmula real, actualizar:
  1. server action / SQL / vista
  2. `src/lib/metricsDefinitions.ts`
  3. este documento

