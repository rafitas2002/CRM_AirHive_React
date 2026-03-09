# Chicken Chaos (Experimento Archivado)

## Estado actual
- El experimento de la gallina fue **aislado del CRM**.
- Ya no se monta globalmente en `src/app/(app)/layout.tsx`.
- El componente vive en:
  - `src/experiments/chicken-chaos/GlobalChickenChaosHandler.tsx`

## Qué hace (última versión)
- Se activa al presionar botones (modo prueba 100%).
- La gallina persigue el cursor.
- Si picotea el cursor:
  - congela la pantalla 1 minuto
  - reinicia conteo de huevos a `0`
- Para desactivarla:
  - debe atravesar `10` huevos seguidos
  - cada huevo dura `4s`
  - si un huevo expira, el conteo se reinicia

## Cómo reactivarlo en el futuro (rápido)
1. Importa el componente en `src/app/(app)/layout.tsx`:

```tsx
import GlobalChickenChaosHandler from '@/experiments/chicken-chaos/GlobalChickenChaosHandler'
```

2. Móntalo dentro de `ThemeProvider` (junto a los handlers globales):

```tsx
<GlobalMeetingHandler />
<GlobalBadgeCelebration />
<GlobalChickenChaosHandler />
<EventTracker />
```

3. (Recomendado) Convertirlo a feature flag antes de activarlo en producción:

```tsx
const enableChickenChaos = process.env.NEXT_PUBLIC_ENABLE_CHICKEN_CHAOS === 'true'
```

```tsx
{enableChickenChaos ? <GlobalChickenChaosHandler /> : null}
```

4. (Opcional) Bajar de modo prueba a modo real:
- `CHICKEN_SPAWN_PROBABILITY` de `1` a `0.05`
- agregar cooldown y excluir botones críticos

## Notas técnicas
- Archivo principal usa `requestAnimationFrame`, listeners globales y overlay fixed.
- No mueve el cursor real del sistema (solo persigue visualmente).
- Si se retoma, conviene crear una ruta de laboratorio (`/lab/chicken-chaos`) para pruebas aisladas.
