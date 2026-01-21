# Deployment Guide: Supabase Edge Function

## Paso 1: Instalar Supabase CLI

```bash
# Windows (usando Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# O descarga directamente desde:
# https://github.com/supabase/cli/releases
```

## Paso 2: Login a Supabase

```bash
supabase login
```

Esto abrirá tu navegador para autenticarte.

## Paso 3: Link al Proyecto

```bash
cd c:\Users\rafae\Documents\React\CRM_AirHive_React\crm-airhive
supabase link --project-ref TU_PROJECT_REF
```

Encuentra tu `PROJECT_REF` en: Supabase Dashboard → Settings → General → Reference ID

## Paso 4: Deploy la Edge Function

```bash
supabase functions deploy capture-snapshots
```

## Paso 5: Configurar Cron Job

1. Ve a Supabase Dashboard
2. Navega a **Edge Functions** → **capture-snapshots**
3. Haz clic en **Cron Jobs** tab
4. Crea un nuevo cron job:
   - **Schedule**: `*/5 * * * *` (cada 5 minutos)
   - **HTTP Method**: GET o POST
   - **Headers**: (ninguno necesario)

## Paso 6: Verificar Logs

```bash
# Ver logs en tiempo real
supabase functions logs capture-snapshots --follow

# O en el dashboard:
# Edge Functions → capture-snapshots → Logs
```

## Paso 7: Testing Manual

Puedes invocar la función manualmente para testing:

```bash
supabase functions invoke capture-snapshots
```

O usando curl:

```bash
curl -X POST https://TU_PROJECT_REF.supabase.co/functions/v1/capture-snapshots \
  -H "Authorization: Bearer TU_ANON_KEY"
```

## Notas Importantes

1. La función usa `SUPABASE_SERVICE_ROLE_KEY` que se configura automáticamente
2. Los logs se mantienen por 7 días en el plan gratuito
3. Cada invocación cuenta hacia tu límite de Edge Function invocations
4. El cron job se ejecuta en UTC, ajusta si es necesario

## Troubleshooting

### Error: "Function not found"
- Verifica que el deploy fue exitoso
- Revisa que el nombre coincida exactamente

### Error: "Permission denied"
- Asegúrate de estar usando el service role key
- Verifica las políticas RLS en las tablas

### Snapshots no se crean
- Revisa los logs de la función
- Verifica que hay reuniones en el rango de tiempo
- Confirma que las reuniones tienen `status='scheduled'`

## Monitoreo

Crea una query en Supabase para monitorear snapshots:

```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as snapshots_created
FROM forecast_snapshots
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```
