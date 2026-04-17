# FLOWQAQC — Arquitectura y Estado Actual (Marzo 2026)

## Stack Real

| Componente | Tecnología |
|---|---|
| Base de datos | Supabase (PostgreSQL) |
| Auth | Cookie `scua_user_id` (sin Supabase Auth) |
| Archivos | AWS S3 directo (fotos + planos PDF/DWG) |
| App móvil | React Native + WatermelonDB (APK Android) ✅ |
| App web | Next.js 14 + TanStack Query v5 + Tailwind + Supabase JS |
| App desktop | Electron wrapping Next.js (objetivo principal actual) |
| PDF client | `@react-pdf/renderer` en browser |

---

## Plataformas

### APK Android — Completada
React Native + WatermelonDB offline-first. Flujo completo: llenar protocolo → foto con sello → enviar → aprobar/rechazar → dossier PDF → visor de planos con anotaciones.

### Web Next.js — En desarrollo activo
Repositorio: `flow-qaqc-web/`. Módulos completados: login, proyectos, ubicaciones, protocolos (llenar/auditar), dashboard, dossier PDF, importar Excel, visor de planos, contactos, botón "Ver plano" desde protocolo.

### Desktop Electron — Objetivo principal actual
Repositorio: `flow-qaqc-desktop/`. Electron envuelve la app Next.js sin reescribir código. PC fijo en obra con planos en disco local.

---

## App de Escritorio Electron

### ¿Por qué Electron?
- Planos PDF cacheados en disco local — no re-descarga de S3 cada vez
- Archivos DWG disponibles localmente
- Instalador `.exe` para Windows, sin configurar servidores

### Estructura de archivos locales

```
D:\Flow-QAQC\
└── {nombre_proyecto}\
    ├── plans\       ← PDFs
    └── plansdwg\    ← DWGs
```

Mapeo directo: `s3_key = "projects/{proj}/plans/archivo.pdf"` → `D:\Flow-QAQC\{proj}\plans\archivo.pdf`

### window.electronAPI (disponible solo en Electron)

| Método | Función |
|---|---|
| `checkLocalFile(s3Key)` | Existe en disco → ruta local o `null` |
| `saveLocalFile(s3Key, buffer)` | Guarda ArrayBuffer descargado de S3 |
| `getLocalPath(s3Key)` | Ruta local sin verificar existencia |
| `openLocalFolder(s3Key)` | Abre carpeta en Explorador de Windows |
| `deleteLocalFile(s3Key)` | Elimina archivo local |
| `listLocalFiles(s3Prefix)` | Lista archivos de una carpeta |

### Flujo PDF en Electron
```
checkLocalFile → ¿existe?
  SÍ → file:///D:/Flow-QAQC/...  (instantáneo)
  NO → mostrar desde S3 → fetch → saveLocalFile → reemplazar con local
```

### Comandos

```bash
# Desarrollo
cd flow-qaqc-web && npm run dev          # Terminal 1
cd flow-qaqc-desktop && npm run dev      # Terminal 2 (carga localhost:3000)

# Producción
cd flow-qaqc-web && ELECTRON_BUILD=1 next build
cd flow-qaqc-desktop && npm run build    # genera .exe
```

---

## Schema Supabase — Tablas principales

| Tabla | Columnas clave |
|---|---|
| `users` | `id, name, apellido, role (CREATOR/RESIDENT/INSPECTOR/VIEWER)` |
| `user_project_access` | `user_id, project_id` |
| `projects` | `id, name, logo_s3_key, stamp_comment, signature_s3_key` |
| `locations` | `id, project_id, name, specialty, location_only, reference_plan, template_ids` |
| `protocol_templates` | `id, project_id, id_protocolo, name` |
| `protocol_template_items` | `id, template_id, partida_item, item_description, validation_method, section` |
| `protocols` | `id, project_id, location_id, template_id, status, filled_by_id, rejection_reason` |
| `protocol_items` | `id, protocol_id, is_compliant, is_na, has_answer, comments` |
| `evidences` | `id, protocol_item_id, s3_key, file_name` |
| `plans` | `id, project_id, name, s3_key, file_type` |
| `plan_annotations` | `id, plan_id, protocol_id, x, y, annotation_data (JSON), status (OPEN/CLOSED)` |
| `annotation_comments` | `id, annotation_id, user_id, text` |
| `phone_contacts` | `id, project_id, name, phone, role, sort_order` |

**Estados de protocolo:** `DRAFT → SUBMITTED → APPROVED` / `SUBMITTED → REJECTED → DRAFT`

---

## Estructura del Repositorio

```
VxP_QAQC_Automatizado/
├── src/                    ← APK React Native — NO TOCAR
├── flow-qaqc-web/          ← Next.js (web + base para Electron)
│   ├── app/                ← Rutas App Router
│   ├── components/         ← UI reutilizable
│   ├── hooks/              ← useLocations, usePlanViewer, useContacts, etc.
│   ├── lib/                ← supabase, stamp, pdfGenerator, s3-upload
│   └── types/              ← Interfaces TypeScript
├── flow-qaqc-desktop/      ← Electron wrapper
│   ├── main.js             ← Proceso principal + IPC handlers
│   ├── preload.js          ← window.electronAPI bridge
│   └── package.json
└── Arquitectura_FLOWQAQC.md
```
