# Reportes por Correo — Guía de configuración (una sola vez)

El código del Módulo de Reportes por Correo ya está completo (panel web + motor + cron). Para que
**envíe correos de verdad** falta esta configuración (acción tuya). Sin esto, el panel funciona y puedes
crear modelos, pero el envío falla con "missing_SES_FROM" / credenciales.

Arquitectura: **GitHub Actions** (cron horario) y la ruta **"Enviar prueba"** corren el mismo motor
(`flow-qaqc-web/lib/reports/generate.ts`), que arma el HTML + gráficos (PNG con resvg) y envía por **AWS SES**.

---

## 1) AWS SES (proveedor de correo) — en la consola de AWS, región `us-east-2`

1. **Verificar el dominio remitente** (recomendado) o un email:
   - SES → *Verified identities* → *Create identity* → *Domain* → escribe tu dominio (ej. `tuempresa.com`).
   - AWS te da registros **DKIM (3 CNAME)** y opcionalmente **SPF/MAIL FROM**. Agrégalos en el DNS de tu
     dominio. Cuando AWS los detecte, el dominio queda *Verified*. (Sin DKIM/SPF, los correos caen en SPAM.)
   - El remitente (`SES_FROM`) debe ser de ese dominio, ej. `Reportes QA/QC <reportes@tuempresa.com>`.
2. **Salir del sandbox** (para enviar a cualquier destinatario):
   - SES → *Account dashboard* → *Request production access*. Mientras estés en sandbox, SOLO puedes enviar
     a emails/dominios **verificados** (para probar, verifica tu propio email en *Verified identities*).
3. **Crear credenciales IAM** con permiso de envío:
   - IAM → *Users* → crea un usuario (ej. `flow-ses-mailer`) → *Access key* (programmatic).
   - Adjunta una policy mínima:
     ```json
     { "Version": "2012-10-17", "Statement": [
       { "Effect": "Allow", "Action": ["ses:SendRawEmail"], "Resource": "*" } ] }
     ```
   - Guarda el **Access Key ID** y **Secret** (no van al código; van a los secrets).

---

## 2) GitHub Secrets — repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*

Para el cron (`.github/workflows/report-mailer.yml`):

| Secret | Valor |
|---|---|
| `SUPABASE_URL` | `https://<tu-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | la **service_role** key (Supabase → Project Settings → API). **Secreta.** |
| `SES_REGION` | `us-east-2` |
| `SES_FROM` | `Reportes QA/QC <reportes@tuempresa.com>` (remitente verificado) |
| `SES_AWS_ACCESS_KEY_ID` | del IAM `flow-ses-mailer` |
| `SES_AWS_SECRET_ACCESS_KEY` | del IAM `flow-ses-mailer` |

> No reutilices los `BACKUP_AWS_*` (esos son del backup); crea unos propios para SES o reusa un IAM con
> permiso de S3 **y** `ses:SendRawEmail`.

---

## 3) Entorno del servidor web (solo para el botón "Enviar prueba")

La ruta `/api/reports/send-test` corre en el servidor de Next, así que ESE entorno también necesita las
mismas variables (las del cuadro de arriba) — en `.env.local` (desarrollo) o en las env del deploy:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SES_REGION`, `SES_FROM`, `SES_AWS_ACCESS_KEY_ID`,
`SES_AWS_SECRET_ACCESS_KEY`. (Si solo usas el cron, este paso es opcional; el botón "Enviar prueba" no
funcionará sin él, pero los envíos programados sí.)

---

## 4) Activar y probar

1. En el proyecto: **Configuración → activar "Reportes por correo"** → aparece la tarjeta en el menú.
2. **Crear un modelo**: nombre, periodicidad/hora/día, **tipo de ensayo** (define la Tabla Resumen),
   ventana, gráficos (elige columnas), mensaje, destinatarios, activo.
3. **"Enviar prueba"** (ícono ✈) → ingresa tu email → revisa la bandeja (y SPAM la primera vez).
   - En sandbox, tu email destino debe estar verificado en SES.
4. **Probar el cron sin esperar**: GitHub → *Actions* → *Report Mailer* → *Run workflow* (workflow_dispatch).
   Revisa el log; cada modelo vencido se envía y se registra en la tabla `report_runs`.

## Cómo verificar que quedó bien
- El correo se ve bien en **Gmail y Outlook** (tabla cuadrada, gráficos visibles inline).
- `report_templates.next_send_at` avanza tras un envío; `report_runs` registra `ok`/`error`.
- Un reporte solo incluye datos de SU proyecto (scope por `project_id`/`org_id`).

## Notas
- **Gráficos:** se rasterizan a PNG en el servidor (resvg) y se adjuntan **inline (CID)** → se ven sin
  "cargar imágenes" en Outlook y sin exponer archivos en S3.
- **Horario en UTC:** `send_hour` es UTC. Perú = UTC−5 (ej. 13:00 UTC = 08:00 Perú).
- **Sin PDF (por ahora):** el reporte es email HTML. Un PDF adjunto se puede sumar después (Puppeteer en
  el mismo Action) reusando el HTML — sin re-arquitectura.
