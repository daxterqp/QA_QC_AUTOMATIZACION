# Borrado y restauración de un PROYECTO — Flow-QA/QC

Procedimiento para **eliminar un proyecto "de raíz"** (toda su base + todos sus
archivos S3, sin huérfanos) y para **restaurarlo** desde su respaldo local.
Es una operación de **administrador, solo en la app de escritorio (web)** y solo
para el rol **CREATOR**. El móvil NO borra proyectos (solo "ocultar/salir").

> ⚠️ El borrado es **irreversible en la nube**. La red de seguridad es el **.zip
> local** que el sistema genera ANTES de borrar: con él podés restaurar el
> proyecto completo cuando quieras.

---

## 1. Flujo de información (mapa mental)

```
                      ┌─────────────────────────────────────────────┐
   App (móvil + web)  │  Supabase Postgres  (protocolos, items, …)   │  ← la BASE (lo crítico)
        │  ▲          │  AWS S3 flow-qc-proyecto (fotos, planos…)    │  ← los ARCHIVOS (su propio original)
        ▼  │          └─────────────────────────────────────────────┘
   ┌───────────────────────────────┬───────────────────────────────────────────┐
   │  Backup diario GitHub→S3       │  Export de PROYECTO (este documento)       │
   │  (toda la BASE, no archivos)   │  (UN proyecto: base + sus archivos)        │
   │  s3://…/backups/db/*.dump      │  D:\Flow-QAQC\exports\proyecto_*.zip       │
   │  keep-15 · para DESASTRE       │  para borrar / mover / archivar un proyecto│
   └───────────────────────────────┴───────────────────────────────────────────┘
```

Tres respaldos, tres propósitos distintos:

| Respaldo | Qué guarda | Cuándo | Restaurar |
|---|---|---|---|
| **Backup diario** (GitHub Actions → S3 `backups/db/`) | TODA la base (no los archivos) | Automático ~02:00 Perú, keep-15 | `docs/RESTORE.md` (pg_restore) |
| **Export de proyecto** (este doc) | UN proyecto: base + archivos S3 | Manual, al eliminar un proyecto | Botón **Importar proyecto** (1 clic) |
| **S3** | Las fotos/planos en sí | Continuo (es el original) | Ya viven en S3; el export también los lleva |

---

## 2. Las 4 LLAVES del borrado

Para borrar un proyecto se exigen, todas a la vez:

- **(A) Respaldo local primero** — el servidor arma un `.zip` (base + archivos S3)
  y lo **verifica en disco** ANTES de borrar nada. Si el respaldo falla (o no se
  pudo bajar algún archivo de S3), **se aborta y no se borra nada**.
- **(B) Solo CREATOR** — verificado en el servidor (no se confía en el cliente).
- **(C) Nombre exacto** — hay que escribir el nombre del proyecto tal cual.
- **(D) Resumen de impacto** — se muestra cuántos ensayos, planos, equipos,
  archivos S3, MB… se van a borrar, y hay que marcar "Entiendo".

Solo si pasan **las 4**, se ejecuta el borrado.

---

## 3. Cómo BORRAR un proyecto (paso a paso)

1. En la app de escritorio, **Proyectos** → en la tarjeta del proyecto, el ícono
   🗑️ (rojo) — solo visible para el **CREATOR**.
2. Se abre la ventana **"Eliminar proyecto de raíz"**:
   - Revisá el **resumen de impacto**.
   - Escribí el **nombre exacto** del proyecto.
   - Marcá la casilla de "Entiendo…".
   - Botón **"Exportar respaldo y eliminar"**.
3. El servidor:
   1. arma el `.zip` (base + archivos S3) y lo guarda en
      `D:\Flow-QAQC\exports\proyecto_<nombre>_<fecha>.zip` y lo **verifica**;
   2. borra la base en **una transacción atómica** (RPC `delete_project_cascade`,
      todo-o-nada, sin huérfanos);
   3. borra los archivos del proyecto en S3 (por prefijo).
4. Al terminar muestra la **ruta del respaldo** y un botón **"Descargar copia"**
   (para guardarlo también en otra carpeta/USB).

**Si algo falla antes del borrado** (p. ej. no se pudo bajar un archivo de S3),
la base y S3 quedan **intactos** — no se borró nada.

---

## 4. Cómo RESTAURAR un proyecto (proceso inverso)

1. **Proyectos** → botón **"Importar"** (header, solo CREATOR).
2. Elegí el `.zip` del proyecto (`proyecto_*.zip`).
3. El servidor:
   - recrea **todas las filas** en la base con **upsert por id** (idempotente: si
     ya existen, las actualiza; re-ejecutable sin duplicar);
   - vuelve a subir **todos los archivos** a sus mismas keys en S3.
4. Listo: el proyecto vuelve a aparecer con su contenido.

> Nota: si restaurás en una base **distinta** donde algunos usuarios ya no
> existen, el sistema ajusta las referencias (pone en null al que firmó/importó si
> no existe, y omite accesos/sesiones de usuarios inexistentes). En la **misma**
> base no se ajusta nada.

---

## 5. Qué contiene el `.zip` de respaldo

```
proyecto_<nombre>_<fecha>.zip
 ├─ manifest.json      (projectId, nombre, fecha, conteos por tabla, nº archivos S3)
 ├─ project.json       (TODAS las filas del proyecto: protocolos, items, evidencias,
 │                       plantillas, planos, anotaciones, equipos, actividades,
 │                       sesiones, muestras, tablas resumen, papelera, accesos, …)
 └─ files/             (los objetos S3 del proyecto, con su key original)
     ├─ projects/<nombre>/photos/…
     ├─ projects/<nombre>/plans/…
     ├─ projects/<nombre>/orthophoto/<ver>/…
     └─ logos/project_<id>/…
```

**NO** se incluyen las **firmas** (`signatures/<userId>/`, son globales/compartidas)
ni los **backups** (`backups/`). Esos nunca se tocan.

---

## 6. Garantías y límites (lo que tenés que saber)

- **Atómico**: el borrado de la base es una sola transacción Postgres → o se borra
  todo o nada (nunca tablas a medias).
- **Sin huérfanos en la base**: la RPC borra explícitamente las ~30 tablas del
  proyecto en orden FK-seguro (no se confía solo en `ON DELETE CASCADE`, porque
  `lab_aux_tables`, `protocol_summary_rows`, `recycle_bin`, `samples` no tienen
  FK a `projects`, y `dashboard_notes` la tiene en `NO ACTION`).
- **Sin huérfanos en S3**: se borran los prefijos `projects/<nombre>/` (con los DOS
  saneos, web y móvil) y `logos/project_<id>/`. Best-effort: si S3 falla, la base
  ya quedó consistente y tenés el `.zip`.
- ⚠️ **Límite conocido (colisión de nombre en S3)**: las keys de S3 usan el
  **nombre saneado** del proyecto, no su id. Si dos proyectos tienen nombres que
  sanean al mismo segmento (p. ej. `"Planta 1"` y `"Planta#1"`), borrar uno
  borraría los archivos del otro en S3. Hoy NO pasa (los proyectos tienen
  segmentos únicos), pero **evitá nombres que colisionen**. La base SIEMPRE se
  borra por `id` (sin colisión). Fix de raíz futuro: usar `project_id` en las keys.
- **Móvil**: no borra proyectos; solo "ocultar/salir" (revoca tu acceso local).

---

## 7. Dónde vive cada cosa (para mantenimiento)

| Pieza | Archivo |
|---|---|
| RPC atómica de borrado | `supabase/v51_delete_project_cascade.sql` |
| Recolección/armado/restore | `flow-qaqc-web/lib/projectBackup.ts` |
| S3 a nivel proyecto (listar/bajar/subir/borrar prefijo) | `flow-qaqc-web/lib/s3Project.ts` |
| Ruta borrar (export+verify+rpc+s3) | `flow-qaqc-web/app/api/projects/delete/route.ts` |
| Ruta importar (restore) | `flow-qaqc-web/app/api/projects/import/route.ts` |
| Ruta resumen de impacto | `flow-qaqc-web/app/api/projects/impact/route.ts` |
| Ruta descargar copia del `.zip` | `flow-qaqc-web/app/api/projects/download-export/route.ts` |
| UI (Importar + Zona de peligro) | `flow-qaqc-web/components/project/ProjectBackupActions.tsx` |
| Gate de rol server-side | `flow-qaqc-web/lib/serverAuth.ts` (`canDeleteProject`) |

Carpeta de exports configurable con `LOCAL_EXPORTS_DIR` (por defecto
`D:\Flow-QAQC\exports`).
