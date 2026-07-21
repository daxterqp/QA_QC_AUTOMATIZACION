-- ============================================================================
-- v102 — JUEGOS DE SECTORES con periodo de vigencia
-- ============================================================================
-- La geometría de los sectores puede cambiar en el tiempo sin que los juegos
-- anteriores queden "mal": cada JUEGO (set) corresponde a un periodo.
--
-- Modelo (sin tablas nuevas — columnas denormalizadas en project_sectors):
--   · set_index  int  NOT NULL DEFAULT 1  → número de juego (1 = inicial).
--   · valid_from date NULL                → fecha en que ENTRA EN VIGENCIA el
--     juego (todas las filas de un juego comparten el mismo valor).
--     NULL = "desde siempre" (el juego inicial).
--
-- Resolución del juego vigente para una fecha D (helper espejo móvil/web
-- `sectorSets.ts`): el MAYOR set_index cuyo valid_from es NULL o <= D.
-- Los ensayos usan el juego vigente a su fecha (ensayo_date); las pantallas
-- de gestión (GIS, avance, filtros) usan el juego vigente HOY.
--
-- Sin juegos nuevos cargados, todo se comporta exactamente como hoy
-- (set_index=1 / valid_from NULL en todas las filas).
--
-- APLICAR ANTES de usar "Cargar nuevo juego de sectores" en la app.
-- ============================================================================

ALTER TABLE public.project_sectors
  ADD COLUMN IF NOT EXISTS set_index integer NOT NULL DEFAULT 1;

ALTER TABLE public.project_sectors
  ADD COLUMN IF NOT EXISTS valid_from date NULL;

COMMENT ON COLUMN public.project_sectors.set_index IS
  'v102 — Número de juego de sectores (1 = inicial). Un juego = geometría vigente en un periodo.';
COMMENT ON COLUMN public.project_sectors.valid_from IS
  'v102 — Fecha en que el juego entra en vigencia (todas las filas del juego comparten el valor). NULL = desde siempre.';

-- Índice para resolver el juego vigente por proyecto.
CREATE INDEX IF NOT EXISTS idx_project_sectors_set
  ON public.project_sectors (project_id, set_index);

-- RLS: las políticas existentes de project_sectors aplican tal cual (mismas
-- filas, columnas nuevas) — no se requieren cambios.
