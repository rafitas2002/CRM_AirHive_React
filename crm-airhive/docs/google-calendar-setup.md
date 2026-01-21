# Configuración de Google Workspace Calendar

## Paso 1: Crear Proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Crea un nuevo proyecto o selecciona uno existente
3. Nombre sugerido: "AirHive CRM"

## Paso 2: Habilitar Google Calendar API

1. En el menú lateral, ve a **APIs & Services** → **Library**
2. Busca "Google Calendar API"
3. Haz clic en **Enable**

## Paso 3: Configurar Pantalla de Consentimiento OAuth

1. Ve a **APIs & Services** → **OAuth consent screen**
2. Selecciona **Internal** (solo para usuarios de @airhivemx.com)
3. Completa la información:
   - **App name**: AirHive CRM
   - **User support email**: tu correo @airhivemx.com
   - **Developer contact**: tu correo @airhivemx.com
4. En **Scopes**, agrega:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
5. Guarda y continúa

## Paso 4: Crear Credenciales OAuth 2.0

1. Ve a **APIs & Services** → **Credentials**
2. Haz clic en **Create Credentials** → **OAuth client ID**
3. Tipo de aplicación: **Web application**
4. Nombre: "AirHive CRM Web Client"
5. **Authorized JavaScript origins**:
   - `http://localhost:3000` (desarrollo)
   - `https://tu-dominio.com` (producción)
6. **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/google/callback` (desarrollo)
   - `https://tu-dominio.com/api/auth/google/callback` (producción)
7. Haz clic en **Create**
8. **IMPORTANTE**: Copia el **Client ID** y **Client Secret**

## Paso 5: Configurar Variables de Entorno

Crea o actualiza `.env.local` en la raíz del proyecto:

```env
# Google Workspace Calendar Integration
NEXT_PUBLIC_GOOGLE_CLIENT_ID=tu_client_id_aqui.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret_aqui
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Para producción, actualiza GOOGLE_REDIRECT_URI con tu dominio real
```

## Paso 6: Aplicar Migración de Base de Datos

Ejecuta en Supabase SQL Editor:

```sql
-- Contenido de database/migrations/002_calendar_tokens.sql
```

## Paso 7: Crear API Routes en Next.js

### Archivo: `src/app/api/auth/google/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getGoogleAuthUrl } from '@/lib/googleCalendarService'

export async function GET() {
    const authUrl = getGoogleAuthUrl()
    return NextResponse.redirect(authUrl)
}
```

### Archivo: `src/app/api/auth/google/callback/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken, storeUserTokens } from '@/lib/googleCalendarService'
import { createClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')

    if (!code) {
        return NextResponse.redirect('/clientes?error=no_code')
    }

    try {
        // Exchange code for tokens
        const tokens = await exchangeCodeForToken(code)

        // Get current user
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.redirect('/clientes?error=not_authenticated')
        }

        // Store tokens
        await storeUserTokens(supabase, user.id, tokens)

        // Redirect back to app with success
        return NextResponse.redirect('/clientes?calendar_connected=true')
    } catch (error) {
        console.error('OAuth callback error:', error)
        return NextResponse.redirect('/clientes?error=oauth_failed')
    }
}
```

## Paso 8: Agregar Botón de Conexión en la UI

En tu componente de configuración o perfil de usuario:

```typescript
import { getGoogleAuthUrl } from '@/lib/googleCalendarService'

function CalendarSettings() {
    const handleConnectGoogle = () => {
        window.location.href = '/api/auth/google'
    }

    return (
        <button 
            onClick={handleConnectGoogle}
            className='px-4 py-2 bg-blue-600 text-white rounded-lg'
        >
            🗓️ Conectar Google Calendar
        </button>
    )
}
```

## Paso 9: Actualizar MeetingModal para Crear Eventos

Modifica `src/components/MeetingModal.tsx` para incluir opción de crear en calendario:

```typescript
const [createInCalendar, setCreateInCalendar] = useState(true)

// En el handleSubmit:
if (createInCalendar) {
    // Verificar si el usuario tiene tokens
    const accessToken = await getUserAccessToken(supabase, currentUser.id)
    
    if (accessToken) {
        // Crear evento en Google Calendar
        const eventId = await createGoogleCalendarEvent(
            accessToken,
            meetingData,
            leadName
        )
        
        // Guardar event_id en la reunión
        meetingData.calendar_event_id = eventId
        meetingData.calendar_provider = 'google'
    }
}
```

## Notas de Seguridad

1. **Nunca** expongas el `GOOGLE_CLIENT_SECRET` en el frontend
2. Usa HTTPS en producción
3. Los tokens se almacenan en Supabase - considera encriptarlos en producción
4. Revoca acceso desde Google Workspace Admin si es necesario

## Testing

1. Haz clic en "Conectar Google Calendar"
2. Autoriza con tu cuenta @airhivemx.com
3. Crea una reunión en el CRM
4. Verifica que aparece en tu Google Calendar
5. Verifica que tiene el link de Google Meet (para reuniones de video)

## Troubleshooting

- **Error: redirect_uri_mismatch**: Verifica que la URI de redirección coincida exactamente
- **Error: access_denied**: El usuario canceló la autorización
- **Error: invalid_grant**: El refresh token expiró, el usuario debe reconectar
