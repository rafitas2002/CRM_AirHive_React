# CONTEXTO MAESTRO DE CONTINUIDAD (CRM AirHive React)

## 1) IDENTIDAD DEL PROYECTO
- Proyecto: CRM AirHive (Next.js App Router + Supabase).
- Ruta local: `/Users/chuygraciav/Documents/Airhive/Proyectos/CRM_AirHive_React/crm-airhive`
- Rama actual: `codex/badges-formato-8f97748`
- Ultimo commit push: `84355d823fab0b7880680aba822859da9c6c731c`
- Estado actual: git limpio (sin cambios locales pendientes).
- Nota: se hizo un commit grande con muchas mejoras (UI, juntas, badges, migraciones, correlaciones, etc.).

## 2) ARQUITECTURA Y REGLAS CRITICAS (FUENTE: AGENTS.md)
- Auth y perfil en `src/lib/auth.tsx`, roles: `admin` y `seller`.
- Realtime con `supabase.channel` para juntas/notificaciones.
- Forecast/snapshots dependen de confirmacion de junta.
- Probabilidad del lead se congela antes de junta y se desbloquea segun flujo de confirmacion.
- Logica temporal reactiva vive principalmente en frontend (`GlobalMeetingHandler`), no asumir procesos backend automaticos.
- Fechas y zonas horarias: usar SIEMPRE `dateUtils` para evitar desfases UTC/local.
- Utilidades clave:
  - `toLocalISOString(date)`
  - `fromLocalISOString(isoString)`

## 3) ARCHIVOS NUCLEO QUE HAY QUE RESPETAR
- `src/lib/meetingsService.ts`
- `src/lib/confirmationService.ts`
- `src/lib/dateUtils.ts`
- `src/components/GlobalMeetingHandler.tsx`
- `src/lib/google-utils.ts`
- `database/reset_calendar_system.sql`

## 4) REQUERIMIENTOS DE NEGOCIO NO NEGOCIABLES (DEL USUARIO)
- Juntas:
  - El contacto principal de la empresa debe aparecer al agendar junta, vinculado realmente a la empresa.
  - Debe permitir multiples participantes de ambas partes (internos y externos).
  - Debe existir opcion "Otro/a" para registrar nuevo contacto de esa empresa.
  - Debe existir contador de juntas por cliente.
  - Si no hay historial de juntas con ese cliente, mostrar "Primera junta" (informativo/no editable).
- Confirmacion de junta:
  - Debe abrir popup al terminar la junta para confirmar si se realizo o no.
  - Si NO se realizo, preguntar motivo y responsabilidad de cancelacion (propia/ajena).
  - Motivos de cancelacion deben venir de catalogo en Supabase.
  - Debe haber 10 motivos comunes + opcion "otra" para crear motivo nuevo.
  - Esos datos deben quedar listos para correlaciones/analitica.
- Badges:
  - Solo otorgar badge o subir nivel cuando aplica realmente.
  - No mostrar popup por "progreso"; solo por desbloqueo/subida de nivel.
  - No repetir popup multiples veces al reconectar.
  - Badge de valor debe basarse en valor real mensual de cierres en estado "CERRADO GANADO".
  - No contar valores estimados ni etapas distintas.
- UI/formato:
  - Usar iconografia Lucide (consistente).
  - Contraste correcto en claro/gris/oscuro.
  - El recado "urgente" y textos deben ser legibles en todos los modos.
  - Popups centrados y con scroll funcional cuando exceden altura.
  - Calendario dentro del popup, sin desbordes recortados.
- Clientes/leads/prospecto:
  - Se pidieron campos opcionales adicionales de perfil para analisis futuro.
  - Se anadio checkbox opcional: si prospecto es familiar de la empresa (hijo/nieto/etc.).
- Correlaciones/tablas:
  - Iconografia de trofeos en tabla de carrera/correlaciones.
  - Cuidado con boton "corregir": cambios deben preservar trazabilidad y consistencia de vinculos.
  - Se pidio ocultar/mostrar tabla de registro de empresa, hacerla mas compacta con scroll.
  - Tabla maestra sellers: incluir metricas de juntas realizadas/pendientes y desglose por modalidad (presencial/llamada/video).

## 5) CAMBIOS IMPORTANTES QUE YA SE METIERON
- Se agregaron migraciones 073 a 089.
- Se anadieron mejoras en reuniones, confirmacion de junta, badges y perfil prospecto.
- Se agrego flag de familiar de empresa en lead:
  - columna `clientes.prospect_is_family_member`
  - soporte en tipos supabase
  - soporte en `ClientModal` / clientes page / pre-leads conversion / admin detail quick lead.
- Se reforzo visibilidad de campos obligatorios en popups:
  - estilos globales en `src/app/globals.css` (nota roja + borde/focus rojo en required)
  - aplicado en modales principales de captura.

## 6) MIGRACIONES (ORDEN RECOMENDADO EN SUPABASE)
- Ejecutar en orden: `073, 074, 075, 076, 077, 078, 079, 080, 081, 082, 083, 084, 085, 086, 087, 088, 089`.
- Errores ya vistos:
  - ERROR `42P16` en VIEW de 089 por orden de columnas.
  - Solucion: en la VIEW, agregar `prospect_is_family_member` al final de columnas existentes (no en medio).
  - ERROR `55006` TRUNCATE `tmp_deal_value_tier_badges_usd` en consultas activas.
  - Solucion aplicada en hotfix de migraciones relacionadas (077/084/088); validar que esten corridas.
  - ERROR `42601` "import { ... }" en SQL editor.
  - Causa: se pego codigo TS/JS en SQL.
  - Solucion: pegar solo SQL puro.

## 7) SI FALLA CREAR LEAD (MENSAJE SAFE-DELETE/TRIGGER LEGACY)
- Ya se manejo un mensaje de error guiando a aplicar 077 y 084.
- Si persiste, revisar que tambien este aplicada 088.
- Confirmar estructura de triggers/funciones en DB este alineada con migraciones nuevas.

## 8) FORMATOS DE DESARROLLO A RESPETAR (MUY IMPORTANTE)
- Mantener estilo premium del producto.
- Evitar UI inconsistente entre temas claro/gris/oscuro.
- No romper la estetica existente.
- No usar iconos fuera de Lucide cuando el modulo ya usa Lucide.
- Campos obligatorios deben verse obvios (rojo/asterisco/nota clara).
- No introducir logica que otorgue badges por progreso parcial.
- Las decisiones de datos de badges/correlaciones deben estar trazables y basadas en datos reales.
- En fechas, no improvisar con `Date` sin pasar por utilidades de `dateUtils` donde aplique.
- No asumir backend scheduler; revisar siempre `GlobalMeetingHandler` y servicios actuales.

## 9) SKILLS DISPONIBLES Y COMO USARLOS (DEL ENTORNO)
- `skill-creator`:
  - path: `/Users/chuygraciav/.codex/skills/.system/skill-creator/SKILL.md`
  - uso: crear o actualizar skills.
- `skill-installer`:
  - path: `/Users/chuygraciav/.codex/skills/.system/skill-installer/SKILL.md`
  - uso: instalar skills desde lista curada o repo.
- Regla:
  - Si usuario menciona un skill por nombre o el trabajo coincide claramente con su proposito, abrir `SKILL.md` y seguir workflow.
  - Resolver rutas relativas desde la carpeta del skill.
  - Cargar solo lo necesario (no todo el arbol).
  - Si no se puede usar skill, declarar bloqueo y seguir con fallback tecnico.

## 10) ARCHIVOS DONDE HUBO MUCHO MOVIMIENTO (REVISAR PRIMERO)
- `src/app/(app)/clientes/page.tsx`
- `src/app/(app)/pre-leads/page.tsx`
- `src/app/(app)/calendario/page.tsx`
- `src/app/(app)/cierres/page.tsx`
- `src/app/(app)/admin/correlaciones/page.tsx`
- `src/components/ClientModal.tsx`
- `src/components/MeetingModal.tsx`
- `src/components/MeetingConfirmationModal.tsx`
- `src/components/GlobalMeetingHandler.tsx`
- `src/components/GlobalBadgeCelebration.tsx`
- `src/components/PreLeadModal.tsx`
- `src/components/CompanyModal.tsx`
- `src/components/TaskModal.tsx`
- `src/lib/confirmationService.ts`
- `src/lib/supabase.ts`
- `src/app/globals.css`
- `database/migrations/073...089`

## 11) PRUEBA E2E MINIMA QUE DEBE CORRERSE AL CONTINUAR
- Crear empresa con contacto principal.
- Crear lead vinculado a esa empresa.
- Verificar campos prospecto opcionales y guardado sin bloquear flujo.
- Agendar junta:
  - contacto principal aparece correctamente.
  - multiple participantes (internos/externos).
  - contador de junta correcto.
- Esperar/forzar confirmacion de junta:
  - popup centrado y scrolleable.
  - confirmar "si se realizo" y validar snapshot/badge behavior.
  - confirmar "no se realizo", seleccionar responsabilidad y motivo.
  - usar opcion "otro" para crear motivo y verificar persistencia en catalogo.
- Validar que popups de badge:
  - no salgan por progreso parcial.
  - no se repitan multiples veces.
- Validar correlaciones y tabla sellers con metricas de juntas.

## 12) INSTRUCCION DE TRABAJO PARA EL NUEVO CHAT
- Priorizar exactitud funcional sobre cambios cosmeticos rapidos.
- Antes de tocar badges o confirmacion de juntas, leer los archivos de servicio y triggers/migraciones asociadas.
- Si hay inconsistencias entre frontend y Supabase, resolver primero la capa de datos (migraciones/funciones) y luego UI.
- Al terminar cualquier cambio, correr typecheck y documentar que SQL exacto debe ejecutar el usuario en Supabase.
