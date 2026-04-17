# S-CUA Desktop

App de escritorio para Windows basada en Electron + Next.js.

## Requisitos
- Node.js 18+
- npm
- La carpeta `flow-qaqc-web/` debe estar en el directorio padre (ya existe)

## Desarrollo (modo rápido)

**Terminal 1 — arrancar Next.js:**
```bash
cd flow-qaqc-web
npm run dev
```

**Terminal 2 — arrancar Electron:**
```bash
cd flow-qaqc-desktop
npm install
npm run dev
```

Electron abre una ventana que carga `http://localhost:3000`.
Los cambios en el código Next.js se ven al instante (hot reload).

## Build del instalador .exe

```bash
cd flow-qaqc-desktop
npm run build
```

Esto:
1. Hace `next build` con `ELECTRON_BUILD=1` (modo standalone)
2. Empaqueta todo con electron-builder
3. Genera el instalador en `../dist-desktop/`

## Caché de PDFs/Planos

Los planos se guardan automáticamente en:
```
C:\Users\{usuario}\AppData\Roaming\S-CUA\plan-cache\
```

- Primera apertura: descarga de S3, guarda localmente
- Siguientes aperturas: carga desde disco (instantáneo, sin internet)

## Variables de entorno

El build incluye las variables del `.env.local` de `flow-qaqc-web/`.
Para cambiar las credenciales, editar ese archivo antes de hacer build.
