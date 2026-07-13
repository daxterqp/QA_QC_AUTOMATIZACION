# 02 — Instalador de escritorio (Electron → NSIS)

> Estado: PLAN — de la revisión exhaustiva del 2026-07-12. El pipeline de
> empaquetado YA EXISTE y está bien cableado (electron-builder + NSIS +
> extraResources del standalone); lo que sigue son los fixes para que
> funcione en la PC de un CLIENTE (no solo en la nuestra) y sea distribuible.

## Cómo funciona hoy (lo que ya está bien)

- `flow-qaqc-desktop/` empaqueta la MISMA web: `npm run build` →
  build de Next con `ELECTRON_BUILD=1` (standalone) → electron-builder NSIS
  x64 → instalador en `dist-desktop/`.
- NSIS correcto para comercial: instalación por usuario (sin admin),
  `oneClick:false`, elegir carpeta, accesos directos. Ícono existe.
- El server hijo escucha solo en 127.0.0.1:3421 (no se expone a la LAN).
- Preload con contextIsolation ✅; ventana oculta de PDF con webSecurity ON ✅.
- El apagado del hijo al salir existe (`app.on('quit')`).

## 🔴 Bloqueadores (la app instalada HOY muere en un Windows limpio)

1. **`spawn('node', …)` — el cliente no tiene Node.** El server standalone se
   lanza asumiendo Node en PATH → en un Windows limpio ENOENT → `app.quit()`
   silencioso. **Fix:** usar el Node embebido de Electron:
   `utilityProcess.fork(serverPath)` (Electron 31 lo trae) o
   `spawn(process.execPath, [serverPath], { env: { ...env, ELECTRON_RUN_AS_NODE: '1' } })`.
   Y en el catch de `app.whenReady`: `dialog.showErrorBox(...)` (hoy muere mudo).
2. **`D:\Flow-QAQC` hardcodeado.** La mayoría de clientes no tiene unidad D:.
   **Fix:** `LOCAL_BASE = path.join(app.getPath('userData'), 'Flow-QAQC')`
   en main.js **y pasar** `LOCAL_PHOTO_CACHE/LOCAL_PLANS_CACHE/LOCAL_EXPORTS_DIR`
   (misma base) + `DESKTOP_MODE=1` en el `env` del server hijo (hoy solo pasa
   PORT/NODE_ENV/HOSTNAME). Documentar al usuario dónde vive su caché.
3. **Las claves AWS quedarían DENTRO del instalador** (mismas
   `NEXT_PUBLIC_AWS_*` del bloqueador web B1, inlineadas en el standalone que
   se copia a `resources\nextjs` — extraíbles con 7-zip; el bucket es de
   TODAS las organizaciones). **Fix (decisión de arquitectura):** tras migrar
   la web a presigned URLs (B1), el escritorio consume los endpoints S3 de la
   **web publicada** (`API_BASE = https://app.flowqaqc.com`) con el token de
   sesión del usuario; el server local queda para lo local (caché, planos,
   ortofoto, PDF). Ningún secreto viaja en el instalador — solo el anon key
   de Supabase (público por diseño).

## 🟠 Altas (misma pasada)

4. **Path traversal en los IPC**: `s3KeyToLocalPath` no valida `..` — con
   `webSecurity:false` (punto 5) un XSS escala a escribir/borrar archivos del
   PC. Fix: resolver y verificar que el path quede DENTRO de LOCAL_BASE
   (patrón que ya usa lib/localCache.ts en la web) + `path.basename()` en los
   filename de print/share.
5. **`webSecurity: false`** en la ventana principal (para PDFs `file://`).
   Fix: quitarlo y servir PDFs locales vía `protocol.handle('scua-local')`
   restringido a LOCAL_BASE, o un IPC readLocalFile.
6. **`setWindowOpenHandler` niega TODO `window.open`** → impresión de QR,
   etiquetas y planos medidos rota SOLO en el .exe. Fix: permitir
   `about:blank` y URLs del propio appUrl.
7. **Sin single-instance lock**: segunda instancia se cuelga del server de la
   primera y al cerrar una, la otra queda muerta. Fix:
   `app.requestSingleInstanceLock()` + enfocar la ventana existente. Además:
   puerto 3421 con verificación de dueño (token propio en un header) o puerto
   dinámico.
8. **Login con Google dentro de Electron será rechazado por Google**
   (disallowed_useragent). Fix v1: ocultar el botón Google cuando
   `window.electronAPI.isElectron` (email+contraseña funciona igual);
   v2: OAuth por navegador del sistema con retorno loopback.
9. **PDF con espera fija de 1000 ms** → fotos S3 en blanco en redes lentas.
   Fix: esperar `document.images` completas + `document.fonts.ready` (y
   embeber Montserrat como data-URI — hoy viene de Google Fonts y offline el
   dossier sale en Arial). Bonus: quitar `pdf-lib` (dependencia muerta).

## 🚀 Distribución (lo que falta para "producto")

10. **Actualizaciones automáticas**: `electron-updater` +
    `publish: { provider: 'generic', url: 'https://<dominio>/desktop-updates' }`
    (o provider s3 — ya hay bucket). electron-builder genera `latest.yml` +
    blockmap; en main: `autoUpdater.checkForUpdatesAndNotify()`. Sin esto,
    cada fix = reinstalación manual del cliente.
11. **Firma de código Windows** (sin ella SmartScreen asusta al cliente):
    **Azure Trusted Signing** (~USD 10/mes, reputación inmediata) — requiere
    subir electron-builder a v26 (`win.azureSignOptions`). Alternativa: cert
    OV (barato, semanas de reputación) o EV (caro, inmediata).
12. **Branding ANTES del primer release**: `productName` "S-CUA" → decidir
    la marca comercial (**Flow QA/QC**) YA: el `appId` (`com.vxp.scua`)
    define la carpeta de datos y la cadena de updates — cambiarlo después
    deja datos huérfanos. `artifactName: FlowQAQC-Setup-${version}.exe` y
    versión visible en un "Acerca de".

## El flujo de release (una vez aplicado lo anterior)

```bash
cd flow-qaqc-desktop
# 1. bump version en package.json (semver)
npm run build          # build Next standalone + electron-builder NSIS firmado
# 2. probar el instalador en una VM Windows LIMPIA (sin Node): checklist abajo
# 3. subir dist-desktop/*.exe + latest.yml + blockmap a /desktop-updates
# 4. los clientes existentes reciben el update solo (updater)
```

**Checklist de la VM limpia** (cada release): instala sin admin → abre y llega
al login → login correo → abre proyecto → foto de un plano local (caché en
userData) → exportar dossier PDF con fotos → imprimir QR/etiqueta → cerrar y
reabrir (sin procesos huérfanos) → segunda apertura enfoca la misma ventana →
desinstalar limpio.

## Decisión de fondo (para tener presente)

El escritorio vale por: **caché local de fotos/planos** (dossiers grandes
rápidos), **ortofotos desde el disco**, e **impresión nativa**. Todo lo demás
es la misma web. Si algún día el mantenimiento del .exe pesa más que esos
tres beneficios, el plan B es "solo web" + una PWA de acceso directo — pero
mientras haya oficinas técnicas con internet flojo, el .exe con caché local
es un diferencial real de venta.
