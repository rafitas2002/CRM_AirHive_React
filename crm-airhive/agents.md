# AirHive CRM: AI Agent Knowledge Base

Este documento sirve como la fuente de verdad técnica y contextual para cualquier desarrollador de IA que trabaje en el proyecto **CRM AirHive**. Aquí encontrarás la arquitectura, lógica de negocio crítica y trampas comunes del sistema.

---
## Hola
## 🏗️ Arquitectura General
- **Framework:** Next.js (App Router).
- **Base de Datos & Auth:** Supabase.
- **Estilo:** Principalmente CSS puro (diseño premium, colores vibrantes, modo oscuro).
- **Estado de Autenticación:** Manejado en `src/lib/auth.tsx`. Soporta roles `admin` y `seller`. 
    - *Tip:* Los perfiles se cachean en `localStorage` para transiciones instantáneas, revalidándose en segundo plano.
- **Tiempo Real:** Se utiliza `supabase.channel` para actualizaciones reactivas en el frontend (ej. notificaciones y estados de juntas).

---

## 💎 Módulos Críticos y Lógica de Negocio

### 1. Sistema de Pronósticos (Forecast) y Snapshots
El CRM rastrea la precisión de los vendedores mediante "snapshots" de probabilidad.
- **Snapshots:** Se registran al finalizar una junta (`confirmationService.ts`).
- **Probabilidad Congelada:** Para evitar trampas, el sistema "congela" la probabilidad al inicio de la junta. Esta lógica reside en el cliente (`GlobalMeetingHandler.tsx`).
- **Bloqueo de Probabilidad:** El campo `probabilidad` en el lead se bloquea automáticamente 5 minutos antes de una junta y permanece bloqueado hasta que se confirma el resultado.
- **Editabilidad:** La probabilidad solo es editable si el lead está en etapa "Negociación" y el usuario es el dueño (`owner_id`), siempre y cuando no haya una junta en curso o por iniciar (ventana de 5 min).

### 2. Otros Módulos Integrados
- **Pre-leads:** Gestión de prospectos iniciales antes de convertirse en clientes formales.
- **Empresas:** Entidad superior que agrupa múltiples leads/contactos.
- **Tareas:** Sistema de seguimiento de actividades vinculadas a leads con estados (`pendiente`, `completada`, etc.).

### 3. Servicios de Comunicación
- **WhatsApp:** Integración simple vía `wa.me` para contacto rápido desde las tablas de clientes (`whatsappUtils.ts`).
- **Gmail API:** Capacidad para enviar correos directamente desde el CRM usando tokens de Google Workspace (`gmailService.ts`).

### 4. Manejo de Fechas y Zonas Horarias (CRÍTICO)
El sistema utiliza `datetime-local` para la entrada de datos, lo que ha causado problemas de desfase de 6 horas (Local vs UTC).
- **Herramienta:** Utilizar **SIEMPRE** `src/lib/dateUtils.ts`.
- `toLocalISOString(date)`: Convierte fechas a un formato que el input entiende sin alterar la hora local.
- `fromLocalISOString(isoString)`: Convierte la cadena del input a un objeto `Date` de JS interpretándolo como hora local, para luego enviarlo a Supabase como UTC con `.toISOString()`.

---

## 🔗 Integraciones Externas
- **Google OAuth:** Manejado en `src/lib/auth.tsx` y `src/lib/google-utils.ts`. Los tokens se refrescan automáticamente si expiran.
- **Google Calendar:** Sincronización de juntas manejada primordialmente mediante Server Actions para evitar desincronizaciones del lado del cliente.
- **External API:** Existe un endpoint en `src/app/api/external` diseñado para agentes externos (como n8n) para crear leads, agendar juntas y crear tareas de forma segura.

---

## 📂 Archivos Clave
- `src/lib/meetingsService.ts`: CRUD de juntas y lógica de bloqueo/congelamiento.
- `src/lib/confirmationService.ts`: Lógica de confirmaciones, snapshots y score.
- `src/lib/dateUtils.ts`: Conversiones seguras de tiempo.
- `src/components/GlobalMeetingHandler.tsx`: Cerebro reactivo del frontend que monitorea juntas, alertas y congela probabilidades.
- `src/lib/google-utils.ts`: Utilidades para manejar la integración con Google APIs.
- `database/reset_calendar_system.sql`: Esquema SQL de referencia que incluye triggers automáticos para alertas (24h, 2h, 15min).

---

## ⚠️ Reglas de Oro para Futuros Agentes
1. **No asumas que hay un servidor:** Casi toda la lógica de "automatización" (como congelar probabilidades) ocurre en el frontend. Si añades un proceso temporal, agrégalo al `GlobalMeetingHandler.tsx`.
2. **Cuidado con los roles:** Verifica siempre `auth.profile?.role`. Los admins gestionan, pero los vendedores ejecutan. Las alertas y popups suelen ser específicos del `seller_id`.
3. **Respetar la Estética:** El usuario valora mucho el diseño "Premium". Usa gradientes, sombras suaves y micro-animaciones al crear nuevos componentes.
4. **Triggers de Base de Datos:** Las alertas de juntas se crean automáticamente vía triggers en Postgres al insertar una nueva junta. No las insertes manualmente a menos que sea una excepción.

---

*Documento actualizado el 2 de febrero de 2026 para incluir detalles de triggers, API externa y lógica reactiva avanzada.*
