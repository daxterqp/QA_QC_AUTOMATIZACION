# 01 — Publicar la web (flujo completo + modificaciones previas)

> Estado: PLAN — generado de la revisión exhaustiva del 2026-07-12 (4 auditores
> sobre el código real). Nada de esto está aplicado aún salvo lo indicado.

## Veredicto de hosting: **VPS con `output: standalone` — NO Vercel/serverless**

Evidencia del propio código (no es preferencia):
- `orthophoto/process` declara `maxDuration=600s` (Vercel Hobby corta a 60 s).
- El staging de ortofoto escribe teselas a disco en una request y las lee en
  OTRA (`/process` → `/commit`) — en lambdas no hay disco compartido: rompería
  siempre.
- `/api/s3-image` y `download-export` devuelven binarios completos — el límite
  de ~4.5 MB de respuesta de Vercel rompe fotos grandes y zips.
- sharp/@img, resvg y geotiff son binarios nativos ya cableados para
  standalone (`outputFileTracingIncludes`).

**Recomendación concreta:** VPS Ubuntu (Hetzner/DigitalOcean/Lightsail,
2 vCPU / 4 GB, ~USD 12–24/mes) + nginx + certbot (HTTPS) + pm2 o systemd
corriendo `node .next/standalone/server.js`. Todo el diseño actual funciona
tal cual ahí.

---

## FASE 0 — Modificaciones OBLIGATORIAS antes de publicar (los bloqueadores)

### 🔴 B1. Claves AWS incrustadas en el JavaScript del navegador
`NEXT_PUBLIC_AWS_ACCESS_KEY_ID` / `NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY` se
inlinean en el bundle: cualquier visitante las extrae con DevTools y obtiene
lectura/escritura/borrado del bucket completo (que además guarda los **dumps
de la base** en `backups/db/`). Archivos cliente que las usan:
`lib/s3-upload.ts` (importado por ExtraPhotos, useFileUpload, useTemplateNorm,
fill/audit/plans pages) y `lib/s3Delete.ts` (useRecycleBin).

**Fix (en este orden):**
1. Renombrar a `AWS_REGION/AWS_BUCKET/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY`
   (sin `NEXT_PUBLIC_`) en los ~11 archivos SERVER que ya las usan (api/s3-*,
   plans/*, orthophoto/commit, lib/s3Project.ts, lib/s3Delete.ts).
2. Lado cliente: `uploadBlobToS3` pasa a pedir un **presigned PUT** a una
   nueva ruta `/api/s3-upload` (con `getServerUser` +
   `keyBelongsToAccessibleProject`, patrón idéntico a `/api/s3-sign`);
   `deleteS3Objects` del cliente pasa a llamar la ruta existente
   `/api/s3-delete`; los GET ya tienen `/api/s3-sign` y `/api/s3-image`.
3. **ROTAR la key IAM en AWS** después del deploy (ya viajó en builds
   anteriores: se asume comprometida). Crear una key nueva con policy mínima
   (solo el bucket, solo s3:Get/Put/Delete/List en `projects/*`; los backups
   con su PROPIA key que solo escribe `backups/*`).

### 🔴 B2. El bucket no puede ser público
`pdfGenerator.s3Url()` y las páginas de planos construyen URLs S3 SIN firma —
eso exige bucket público, y las keys son adivinables (`projects/<nombre>/...`).
**Fix:** S3 → Block Public Access **ON**, y reemplazar `s3Url()` por
`/api/s3-sign` (sesión + acceso por proyecto) o el proxy `/api/s3-image`.
(El fallback del PDF web ya usa el proxy — es cambiar los 3–4 call sites.)

### 🔴 B3. Rutas de "disco local" expuestas en internet
`/api/orthophoto/process` acepta `srcPath` arbitrario → sondea/lee archivos
DEL SERVIDOR (oráculo confirmado por su mensaje de error); `plans/local-list`
lista el disco. Son features de ESCRITORIO. **Fix:** gate por env: al inicio
de esas rutas `if (process.env.DESKTOP_MODE !== '1') return 404` (el
empaquetado de Electron seteará `DESKTOP_MODE=1`; el VPS no).

### 🔴 B4. Respaldo del borrado de proyecto en serverless/disco
`projects/delete` escribe el .zip de respaldo a disco y `download-export` lo
lee en otra request. En VPS basta definir `LOCAL_EXPORTS_DIR` persistente;
si algún día van a serverless, subir el zip a S3 y devolver presigned URL.

### 🟠 Altas (hacer en la misma pasada)
- `plans/upload` y `projects/import`: **límite de tamaño** (25 MB planos /
  200 MB import) y cantidad de archivos antes de `arrayBuffer()`; rate-limit
  mínimo por usuario en upload/import/send-test/s3-sign.
- `reports/send-test`: exigir rol (Jefe/Creador), restringir `toEmail` a los
  destinatarios del template o al correo propio.
- `pushNotification.ts`: mandar el access_token de la SESIÓN (no la anon key)
  y validar usuario/rol en la Edge Function `send-notification`.
- `s3-image`: `Cache-Control: private` (hoy `public` — un CDN delante
  filtraría fotos entre usuarios) + quitar los console.log de keys.
- Respuestas que filtran rutas absolutas del server (`zipPath`, mensajes con
  `srcPath`): devolver solo nombres.

### 🟡 Pulido pre-lanzamiento (medias/bajas)
- `app/icon.png` (favicon), `app/robots.ts`, `app/not-found.tsx`,
  `app/error.tsx` con la estética del login; metadata openGraph.
- `.env.local.example` completo (faltan 8 vars: SERVICE_ROLE, SES_*, LOCAL_*).
- Derivar el hostname de Supabase en `next.config.js` y `pushNotification.ts`
  desde `NEXT_PUBLIC_SUPABASE_URL` (hoy hardcodeado).
- Hora de reportes por correo: `computeNextSendAt` usa UTC — convertir la
  hora elegida de Lima a UTC (o etiquetar el selector) EN AMBOS espejos.
- Versión visible: `NEXT_PUBLIC_APP_VERSION` en el footer del login/menú.
- Console.log por request en rutas API → condicionar a no-producción.
- Unificar `toLocaleString('es-PE', { timeZone: 'America/Lima' })` en un
  helper (hoy conviven es-PE/es-CL y sin TZ fija).

---

## FASE 1 — El flujo de publicación (checklist ejecutable)

1. **Aplicar Fase 0** (bloqueadores + altas) → `tsc` 0, `next build` OK,
   probar en local: subir foto, abrir plano, exportar dossier, borrar
   proyecto con respaldo.
2. **Dominio**: comprar (ej. `flowqaqc.com`) → DNS A → IP del VPS. Decidir
   subdominio: `app.flowqaqc.com` (la landing de marketing puede vivir aparte
   en la raíz).
3. **VPS**: Ubuntu 22.04 → `ufw` (22/80/443) → nginx + certbot →
   Node 20 LTS → usuario de servicio.
4. **Build y deploy**:
   ```bash
   ELECTRON_BUILD=1 npm run build     # genera .next/standalone (mismo flag que desktop)
   # copiar .next/standalone + .next/static + public al VPS
   # systemd: node server.js con EnvironmentFile=/etc/flow-qaqc/env
   ```
5. **Variables de entorno del server** (`/etc/flow-qaqc/env`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (build-time),
   `AWS_REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY` (la key NUEVA),
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (solo si se usa send-test),
   `SES_FROM/SES_REGION/SES_AWS_*`,
   `LOCAL_PHOTO_CACHE=/var/lib/flow-qaqc/cache`,
   `LOCAL_PLANS_CACHE=/var/lib/flow-qaqc/plans`,
   `LOCAL_EXPORTS_DIR=/var/lib/flow-qaqc/exports`.
   ⚠️ Las `NEXT_PUBLIC_*` se fijan EN EL BUILD, no en runtime.
6. **nginx**: proxy a 127.0.0.1:3000 con `proxy_set_header Host $host` y
   `X-Forwarded-Proto https` (sin esto el callback de OAuth redirige a
   localhost), `client_max_body_size 220m` (imports).
7. **Supabase Auth → URL Configuration**: Site URL = `https://app.flowqaqc.com`;
   Redirect URLs += `/auth/callback` y `/reset` del dominio (mantener
   localhost para dev). **Google Cloud Console**: Authorized JavaScript
   origins += el dominio (el redirect URI de Google NO cambia — es el de
   Supabase). Ver docs/LOGIN_GOOGLE_SETUP.md.
8. **S3**: Block Public Access ON + CORS del bucket permitiendo PUT presigned
   desde el dominio + rotar la key IAM (B1.3).
9. **Smoke test de producción** (con el proyecto demo): login (correo y
   Google), crear/llenar/aprobar ensayo, foto (sube y se ve), plano, dossier
   PDF, borrar+restaurar de papelera, export/import de proyecto, realtime
   entre dos navegadores, reporte de prueba.
10. **Operación**: backup.yml ya corre (verificar secrets del repo);
    report-mailer.yml con sus 6 secrets; monitoreo mínimo (UptimeRobot al
    dominio + `journalctl` del servicio); log rotate.

## FASE 2 — Después del lanzamiento (no bloqueante)
Rate limiting robusto (si crece el uso), CDN delante (con el fix de
Cache-Control ya hecho), staging separado (proyecto Supabase aparte),
página /status, y del backlog: bucket S3 por organización.
