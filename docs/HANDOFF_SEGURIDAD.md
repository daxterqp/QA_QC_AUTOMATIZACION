# Handoff — Seguridad Fase 2 (lo que tenés que hacer vos, Joseph)

> Estado: el código y la base **ya están migrados a Supabase Auth + RLS estricto** y
> verificados (tsc móvil 0 · tsc web 0 · engineTests 257/257 · next build OK · advisor
> sin errores). Quedan **6 tareas que dependen de vos** (no las puedo hacer yo porque
> requieren tu cuenta/decisión o porque tocan credenciales). Están ordenadas por prioridad.

---

## 1. (IMPORTANTE) Re-crear los 4 usuarios: Angel, Pablo, Pedro, Ruben

**Por qué:** con el login nuevo por **email**, esos 4 usuarios *todavía no tienen cuenta*
(antes entraban por nombre+clave en texto plano, que ya no existe). Hasta que los re-crees,
**no pueden entrar**. Además `user_project_access` está vacía → aunque entren, no verán
ningún proyecto hasta que les des acceso.

**Cómo (desde el celular, app móvil, logueado como vos = CREATOR):**
1. Menú lateral → **Gestión de usuarios**.
2. Botón **“Añadir usuario”**.
3. Por cada uno completá: **Email real**, **Nombre**, **Apellido**, **Rol**
   (Pablo=SUPERVISOR, Pedro=RESIDENT, Ruben=SUPERVISOR, Angel=CREATOR si querés otro admin),
   una **contraseña temporal** (mín. 6 caracteres) y **tildá los proyectos** a los que tendrán acceso.
4. Guardá. Pasales la clave temporal; ellos la cambian en *Cambiar contraseña*.

> También se puede desde la **web** (`/app/users`) si te resulta más cómodo escribir.
> Si una alta falla, ahora te muestra el **motivo real** (p.ej. “email already registered”).

---

## 2. Activar “Leaked Password Protection” (1 clic)

**Por qué:** Supabase puede rechazar contraseñas que aparecen en filtraciones conocidas
(HaveIBeenPwned). Hoy está **desactivado**.

**Cómo:** Dashboard de Supabase → **Authentication** → **Policies/Settings** →
activá **“Leaked password protection”**. Listo.

---

## 3. Revocar la API key de Firecrawl

**Por qué:** la key `fc-2141…` quedó en el historial de git (commit viejo). Aunque ya
sacaste Firecrawl del `.mcp.json`, **la key sigue viva** y cualquiera con acceso al repo
podría usarla.

**Cómo:** entrá a **firecrawl.dev** → tu cuenta → **API Keys** → **revocá/eliminá** esa key.
(No hace falta generar una nueva: no estás usando Firecrawl.)

---

## 4. Resetear la contraseña de la base de datos

**Por qué:** la clave `Finallock123!` se compartió en el chat → hay que considerarla
**expuesta**. Es la que usa el backup automático.

**Cómo:**
1. Dashboard → **Project Settings** → **Database** → **Reset database password** (generá una nueva).
2. Reconstruí la cadena de conexión del **Session Pooler** con la clave nueva.
3. Actualizá el secreto de GitHub **`SUPABASE_DB_URL`** (repo → Settings → Secrets → Actions)
   con esa nueva cadena, o el backup diario dejará de funcionar.

---

## 5. Darme el OK para borrar las columnas legacy `users.password` y `users.pin`

**Por qué:** ya no se usan (el login pasa por Supabase Auth). Son texto plano residual.
Borrarlas es **destructivo en producción**, así que el sistema me lo bloqueó hasta que vos
lo autorices explícitamente.

**Qué necesito de vos:** un “dale, borrá password y pin”. Antes de borrarlas hago un
respaldo puntual de esas columnas por las dudas. (Riesgo real: bajo — nada las lee ya.)

---

## 6. Probar en el celular (después del paso 1)

Para confirmar que el RLS quedó bien:
- Entrá con **un usuario no-CREATOR** (p.ej. Pedro) → debe ver **solo el/los proyecto(s)**
  que le asignaste, **no todos**.
- Abrí un protocolo con **fotos** → las imágenes deben **cargar** (no “403/rota”).
- **Crear/editar/aprobar** un ensayo → debe **sincronizar** sin error.
- Probá **“Unirme a un proyecto”** con la contraseña del proyecto.
- Como CREATOR, probá **crear/editar/desactivar** un usuario desde Gestión de usuarios.

Si algo falla, anotá el mensaje (ahora son descriptivos) y me lo pasás.

---

### Hardening futuro (opcional, NO urgente)
- **Keys S3 por `project_id`**: hoy las rutas S3 se autorizan comparando el *nombre
  saneado* del proyecto (la carpeta `projects/<nombre-saneado>/...`). Como ese saneado
  pierde información, dos proyectos con nombres muy parecidos podrían colapsar a la
  misma carpeta y mezclarse. Hoy **no pasa** (los 10 proyectos tienen carpetas únicas)
  y la app es interna, pero si en el futuro hay muchos proyectos conviene migrar a usar
  el **id** del proyecto (un UUID único) en la ruta. Es una migración (renombrar objetos
  en S3 + actualizar la base), por eso la dejo anotada y no la hago sin que puedas probar.
- **Mover los helpers RLS a un schema `private`** para silenciar los 15 avisos
  “authenticated_security_definer” (son inofensivos, por diseño). Requiere reescribir
  las 35 políticas → hacerlo juntos, con la app a mano para probar.
- **Firma S3 server-side** (que la clave AWS no viaje al cliente). Mitigado hoy por
  permisos mínimos de esa clave.

### Lo que YA quedó hecho (no tenés que tocar)
- Login por email (móvil + web) sobre Supabase Auth real.
- RLS estricto en las 35 tablas (`can_access_project` + helpers); 0 políticas permisivas.
- Edge Function `admin-users` para alta/baja/edición segura (service_role).
- Rutas API web con dueño/ownership + scoping S3 por proyecto + rechazo de path traversal.
- Backups diarios GitHub→S3 (keep-15) + `docs/RESTORE.md`.
- 3 rondas de revisión + corrección de bugs. Commits `337e4ca`, `ec1297a`.
