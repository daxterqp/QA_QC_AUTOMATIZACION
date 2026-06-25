# Acceso con Google en el login web — Setup

El botón **"Continuar con Google"** ya está en el login web (`flow-qaqc-web/app/login/page.tsx`)
y la ruta de retorno (`app/auth/callback/route.ts`) ya intercambia el `code` de Google por la
sesión (cookies SSR). El login por **email/contraseña no cambió** — Google es 100% aditivo.

Para que el botón funcione de verdad hay que hacer **una configuración única** en Google Cloud y en
Supabase. No requiere tocar código. El usuario nuevo que entre por Google se provisiona solo como
**Visualizador (VIEWER)** sin acceso (trigger `on_auth_user_created`) hasta que un Creador le asigne
rol/proyectos — igual que el plan de Auth.

---

## Paso 1 — Google Cloud: crear el cliente OAuth

1. Entrá a <https://console.cloud.google.com/> → creá (o reusá) un proyecto.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - Completá nombre de la app, correo de soporte y correo del desarrollador. Guardá.
   - (En "Testing" alcanza para probar; para abrirlo a cualquiera, luego **Publish app**.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins** — agregá los orígenes desde donde se sirve la web:
     - `http://localhost:3000` (desarrollo)
     - el origen de la app de escritorio / web pública si aplica.
   - **Authorized redirect URIs** — pegá la **URL de callback de Supabase** (la del Paso 2, NO la de tu app):
     - `https://<TU-REF>.supabase.co/auth/v1/callback`
   - Create → copiá el **Client ID** y el **Client Secret**.

> La redirect URI que Google necesita es la de **Supabase** (`/auth/v1/callback`), no la de la app.
> Supabase recibe el retorno de Google y luego redirige a nuestra ruta `/auth/callback`.

## Paso 2 — Supabase: habilitar el proveedor Google

1. Dashboard → **Authentication → Providers → Google** → habilitar (toggle ON).
2. Pegá el **Client ID** y **Client Secret** del Paso 1 → Save.
3. La página muestra la **Callback URL** (`https://<TU-REF>.supabase.co/auth/v1/callback`) — es la que
   va en "Authorized redirect URIs" de Google (Paso 1). Confirmá que coincide.

## Paso 3 — Supabase: URLs de redirección de la app

Dashboard → **Authentication → URL Configuration**:
- **Site URL**: el origen principal de la web (ej. `http://localhost:3000`).
- **Redirect URLs** (Add URL) — agregá la ruta de retorno de NUESTRA app, una por cada origen:
  - `http://localhost:3000/auth/callback`
  - `<origen-produccion>/auth/callback` (si la web se sirve en otro dominio/puerto)

> El botón manda a Google con `redirectTo = <origin>/auth/callback`; Supabase solo permite redirigir a
> URLs que estén en esta lista. Si falta, el login vuelve con `?error=oauth` y se muestra el aviso.

---

## Probar

1. Reiniciá la web, andá al login → **Continuar con Google** → elegí tu cuenta.
2. Vuelve a la app autenticado. Si es una cuenta nueva, entra como **VIEWER sin acceso** (verá el
   estado vacío hasta que un Creador le asigne proyectos).
3. Si vuelve a `/login?error=oauth`: revisá que (a) Google tenga la redirect URI de Supabase, (b) la
   `/auth/callback` de tu origen esté en las Redirect URLs de Supabase, (c) el Client ID/Secret sean
   correctos.

## Notas

- **No expone secretos en el cliente**: el `signInWithOAuth` solo arranca el flujo PKCE; el intercambio
  `code → sesión` lo hace el servidor en `/auth/callback`.
- **Email/contraseña intacto**: el botón Google es aditivo; el formulario de siempre sigue igual.
- **Rol del nuevo usuario**: VIEWER por defecto (trigger `handle_new_user`/`on_auth_user_created`). El
  Creador lo sube de rol y le asigna proyectos en Usuarios.
