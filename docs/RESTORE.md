# Backups y Restauración — Flow-QA/QC

Guía práctica de respaldos de la base **Supabase** (Postgres) y de los archivos de **S3**
(fotos, planos, ortofotos). Pensada para seguir paso a paso sin ser experto.

---

## 1. Qué se respalda (y qué no hace falta)

| Dato | Dónde vive | Cómo se respalda |
|---|---|---|
| **Base de datos** (protocolos, ítems, usuarios, proyectos…) | Supabase Postgres | Backup diario automático → S3 (`backups/db/`) |
| **Fotos, planos, ortofotos** | AWS S3 (`flow-qc-proyecto`) | **Ya están en S3** (son el original). Opcional: copia offline. |
| **Base local del móvil** (WatermelonDB) | Cada celular | Se re-sincroniza desde la nube (no requiere backup propio) |

> La base es lo crítico e irrecuperable si se borra. Las fotos/planos ya viven en S3 y además
> quedan cacheadas en la PC del desktop, así que el foco del respaldo es la **base**.

---

## 2. Backup automático (ya configurado)

- **Dónde**: GitHub Actions → workflow `.github/workflows/backup.yml`.
- **Cuándo**: todos los días ~02:00 (Perú). También a mano desde **Actions → Backup Supabase DB → Run workflow**.
- **Qué hace**: `pg_dump` de la base → archivo `flowqc-<fecha>.dump` → lo sube a `s3://flow-qc-proyecto/backups/db/`.
- **Retención**: conserva las **últimas 15** copias y borra las más viejas. La limpieza corre
  **solo cuando se crea un backup nuevo**, así que si los backups se detienen, las últimas 15
  quedan intactas (nunca te quedás en cero).
- **Bonus**: la conexión diaria mantiene **despierto** el proyecto Free (evita la pausa por inactividad).

> ⚠️ GitHub desactiva los workflows programados si el repo no tiene actividad por **60 días**
> (avisa por mail; se reactiva con 1 clic). Por eso conviene también la copia manual (sección 3).

---

## 3. Copia manual a tu PC (última línea de defensa)

### Opción A — Sin instalar nada (recomendada para empezar)
Cada 2-3 días:
1. Entrá a la consola de AWS S3 → bucket **`flow-qc-proyecto`** → carpeta **`backups/db/`**.
2. Ordená por *Última modificación* y **descargá** el `.dump` más reciente a una carpeta de tu PC
   (ej. `D:\Backups\flow-qaqc\`).

Eso te deja una copia offline de la base, sin instalar nada.

### Opción B — Automatizada (un doble-clic)
Si instalás **AWS CLI** (instalador oficial de Amazon, ~2 min), podés usar el script
`scripts/backup-local.ps1` (en este repo), que baja la última copia de la base **y** sincroniza
las fotos/planos de S3 a tu PC. Ver instrucciones dentro del script.

---

## 4. Cómo RESTAURAR (si pasa lo peor)

Restaurar es un evento raro: tomate tu tiempo y, si podés, **probá primero en un proyecto Supabase
vacío** antes de tocar el de producción.

### 4.1 Herramientas (instalar solo cuando toque restaurar)
- **PostgreSQL client** (trae `pg_restore` y `psql`): https://www.postgresql.org/download/windows/
- **AWS CLI** (para bajar el dump): https://aws.amazon.com/cli/  *(o bajá el `.dump` a mano desde la consola S3)*

### 4.2 Conseguir el dump
Bajá el `flowqc-<fecha>.dump` que quieras restaurar (de S3 `backups/db/`) a tu PC.

### 4.3 Restaurar la base
Usá el connection string **Session pooler** del proyecto destino (el mismo formato del backup):
```
pg_restore --clean --if-exists --no-owner --no-privileges --no-comments \
  -d "postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-us-west-2.pooler.supabase.com:5432/postgres" \
  flowqc-<fecha>.dump
```
- `--clean --if-exists`: borra los objetos actuales antes de recrearlos (restauración "encima").
- Para máxima seguridad, restaurá en un **proyecto Supabase nuevo/vacío** y, cuando confirmes que
  está todo, apuntás la app a ese proyecto.

### 4.4 Restaurar archivos de S3 (normalmente NO hace falta)
Las fotos/planos siguen en S3. Solo si se borraron, restaurá tu copia local:
```
aws s3 sync "D:\Backups\flow-qaqc\s3\" "s3://flow-qc-proyecto/"
```

### 4.5 Re-sincronizar los celulares (IMPORTANTE)
Tras restaurar la nube, cada celular debe hacer un **pull forzado** para que la nube restaurada
se imponga y no la pisen datos locales viejos. En la app: entrar al proyecto y forzar la
sincronización (la lógica vive en `src/services/SupabaseSyncService.ts`, pull cloud-wins).

---

## 5. Recordatorios
- Verificá de vez en cuando que en S3 `backups/db/` aparezcan copias **recientes** (el workflow anda).
- Para borrados puntuales de un ensayo, ya existe la **papelera** (`recycle_bin`) — no necesitás un restore completo.
- El backup completo es para el desastre grande (corrupción, borrado masivo, error de migración).
