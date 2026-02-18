# CRM AirHive - Handoff Operativo (2026-02-18)

Este documento resume el estado funcional y visual para continuar trabajo en un chat nuevo sin perder contexto.

## 1) UI/UX global estandarizada

### 1.1 Iconografia estandarizada
- Patron visual objetivo:
  - Fondo del icono: azul muy oscuro.
  - Trazo del icono: blanco.
  - Misma forma de tarjeta para iconos de cabecera entre ventanas.
- Se utilizo la clase de diseno compartida (`ah-icon-card`) en headers y bloques principales.
- Requisito de continuidad:
  - Cualquier icono nuevo en settings/admin/modulos debe respetar el mismo shell visual.

### 1.2 Hover y puntero (cursor)
- Regla global aplicada:
  - Elemento clickeable => debe mostrar `cursor: pointer` y feedback visual (hover).
  - Elemento NO clickeable => no debe mostrar pointer.
- Se corrigieron casos donde cards no clickeables mostraban pointer y botones sin pointer.
- Requisito de continuidad:
  - Mantener consistencia en todas las vistas (`clientes`, `empresas`, `calendario`, `settings`, `admin`).

### 1.3 Roles y colores en Equipo
- Hover de cards en equipo:
  - `admin`: delineado amarillo/naranja.
  - `seller`: delineado verde.
- Silueta de avatar sin foto:
  - `admin`: amarillo/naranja.
- Badge/etiqueta de rol `ADMINISTRADOR` debe seguir el esquema visual de admin.
- Filtros de areas:
  - Cada area con color propio (paleta amplia para evitar repetidos).
  - Hover coloreado + pointer.
  - Mapeo semantico esperado (ejemplos):
    - RH: amarillo.
    - Finanzas: verde.
    - Directores: morado.

## 2) Badges: logica y funcionamiento esperado

### 2.1 Tipos de badges activos en sistema
- Industriales por cierres (seller_industry_badges).
- Especiales (seller_special_badges / seller_special_badge_events), incluyendo:
  - `admin_granted`
  - `closing_streak` (activa/pausada)
  - `deal_value_tier`
  - `race_points_leader` (activo/historico)
  - Otros de legado (race, ubicacion, company size, reliability, tenure, etc.).

### 2.2 Asignacion admin manual
- Se soporta asignacion admin via accion server (`grantAdminBadgeToSeller`), visible en ProfileView.
- Colores solicitados para insignias admin por persona (regla de negocio):
  - Jesus Gracia: morada.
  - Rafael: roja.
  - Alberto: azul.
  - Eduardo: verde.

### 2.3 Popup de felicitacion
- Existe componente de celebracion en tiempo real: `GlobalBadgeCelebration`.
- Escucha inserciones en:
  - `seller_badge_events`
  - `seller_special_badge_events`
- El popup debe salir en el momento que se inserta evento `unlocked` o `upgraded` para el usuario activo.

### 2.4 Leader badge por puntos de carrera
- Sistema de puntos consolidado:
  - 1er lugar = 3 pts
  - 2do lugar = 2 pts
  - 3er lugar = 1 pt
- Badge especial con dos estados de etiqueta:
  - Activo: lider actual en puntos.
  - Historico: lo tuvo en el pasado.
- Recalculo disparado por cambios en `race_results`.

## 3) Correlaciones y Pronostico (Insights Admin)

### 3.1 Objetivo funcional
- Deben existir ventanas separadas dentro de Insights para:
  - Correlaciones (grafica / dispersion / indicadores).
  - Pronostico de comportamiento (incl. probabilidad de posponer/cancelar por segmentos como tamano de empresa).
- Deben estar operativas como antes (no placeholders).

### 3.2 Estado que se debe preservar
- Se usan datasets derivados de historial real (juntas, cierres, eventos, leads).
- El pronostico debe permitir inferencias del tipo:
  - "probabilidad de que una empresa de tamano X posponga junta".
- Se corrigio posicion visual de header `Data & Correlaciones` para que quede arriba.

## 4) Reglas de carrera (ranking visual)

- Empates comparten posicion.
- Usuarios con `$0` inician en posicion `4` (regla explicita de negocio).
- Boton de info de carrera debe tener hover estandar + pointer.

## 5) Incidentes y fixes recientes relevantes

- Se corrigio build error por conflicto/merge markers en `globals.css` (token `HEAD`).
- Se corrigieron imports faltantes (`RotateCw`) que rompian build en `clientes`.
- Se corrigio JSX roto en `admin/correlaciones/page.tsx` (grid de insights).
- Se corrigio orden de header en correlaciones.
- Se aplicaron fixes de TypeScript en:
  - `src/app/(app)/usuarios/UsersClient.tsx`
  - `src/components/GlobalBadgeCelebration.tsx`
  - `src/components/ProfileView.tsx`
  - `src/components/SellerRace.tsx`

## 6) Criterios de aceptacion para siguientes cambios

- `npm run build` sin errores.
- `npx tsc --noEmit` sin errores.
- Sin inconsistencias de pointer/hover.
- Iconografia homogenea en settings y ventanas principales.
- Correlaciones + pronostico visibles y funcionales en Insights.
- Popup de badge visible en desbloqueo/mejora.

