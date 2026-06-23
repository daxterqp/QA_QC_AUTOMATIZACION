# Spec — Borrado y restauración de proyecto "de raíz"

Fecha: 2026-06-22 · Estado: implementado (web/desktop)

## Objetivo
Procedimiento seguro para **eliminar un proyecto de raíz** (base + S3, sin
huérfanos) con respaldo local previo, y su **proceso inverso** (importar/restaurar).
Más: documentar el flujo de backup GitHub→S3 y mapear/verificar el hard delete de
ensayos.

## Decisiones (acordadas con el usuario)
- **Llaves del borrado**: (A) export local obligatorio · (B) solo CREATOR ·
  (C) escribir el nombre exacto · (D) confirmar resumen de impacto. (Sin re-auth ni frase fija.)
- **Export**: ZIP completo restaurable (base + archivos S3). **S3 se borra** (sin huérfanos).
- **Plataforma**: solo web/desktop. Móvil mantiene "ocultar/salir".
- **Restore**: importar 1-clic desde el `.zip`.
- **Motor**: RPC atómica `delete_project_cascade` (Enfoque 1), espejo de la de ensayos `v44/v50`.
  No se retrofitan FK cascade (riesgoso); se borra todo explícito en la RPC.

## Arquitectura
1. **DB**: RPC `delete_project_cascade(p_project_id)` `SECURITY DEFINER`, una
   transacción, guardia de id vacío + BOLA (`can_access_project`), idempotente.
   Borra las ~30 tablas en orden FK-seguro (derivado del grafo real de FKs) y
   `projects`. No usa solo `ON DELETE CASCADE` porque `lab_aux_tables`,
   `protocol_summary_rows`, `recycle_bin`, `samples` no tienen FK y
   `dashboard_notes` la tiene `NO ACTION`. (`supabase/v51_delete_project_cascade.sql`)
2. **Export ZIP** (`lib/projectBackup.ts`): recolecta filas (project_id directo +
   hijas vía padres), lista S3 (`lib/s3Project.ts`), arma
   `manifest.json + project.json + files/<key>`. Si falla la descarga de ALGÚN
   archivo S3 → el borrado se ABORTA (no perder fotos por respaldo incompleto).
3. **Ruta delete** (`app/api/projects/delete`): valida CREATOR + nombre exacto →
   arma+escribe+verifica el `.zip` en `D:\Flow-QAQC\exports\` → RPC atómica →
   `deleteProjectS3` (prefijos `projects/<seg web|móvil>/` + `logos/project_<id>/`,
   best-effort, excluye `backups/` y `signatures/`).
4. **Restore** (`app/api/projects/import`): lee el zip → upsert idempotente por id
   en orden FK-seguro → re-sube `files/` a S3. Saneo de refs a `users` ausentes.
5. **Impacto** (`app/api/projects/impact`): conteos + stats S3 para la llave D.
6. **Descarga** (`app/api/projects/download-export`): baja una copia del `.zip` (path-guard).
7. **UI** (`components/project/ProjectBackupActions.tsx`): Importar (header) +
   Zona de peligro 🗑️ con las 4 llaves (tarjeta). Solo CREATOR.

## Sin service-role
No hay `SUPABASE_SERVICE_ROLE_KEY`. Funciona con el cliente autenticado (anon+JWT)
porque `can_access_project` corta para CREATOR (creator/dueño/miembro) → un CREATOR
lee/inserta todo por RLS; el borrado va por RPC `SECURITY DEFINER`.

## Verificación
- tsc web 0 · `next build` OK.
- Grafo de FK + PK consultado a la base real (orden de borrado/inserción derivado de ahí).
- Columnas de scoping verificadas contra el esquema (consulta inocua).
- RPC creada y validada (`pg_proc`).

## Límite conocido
Las keys S3 usan el **nombre saneado** (no el id) → colisión teórica si dos
proyectos sanean igual (hoy no pasa). La base SIEMPRE se borra por `id`. Documentado
en `docs/BORRADO_PROYECTO.md` §6.

## Hard delete de ensayos (mapeo + huecos)
Robusto: RPC `delete_protocol_to_recycle` (v44, BOLA en v50), snapshot a
`recycle_bin` antes, atómico, S3 best-effort. Huecos (fuera de scope, mapeados):
(1) sin restaurar-desde-papelera; (2) S3 best-effort → posible huérfano si falla el
collect. No se tocan en esta entrega.
