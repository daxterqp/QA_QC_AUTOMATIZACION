-- Crea la tabla plan_measurements en Supabase para sincronizar mediciones de planos
-- desde la app móvil (schema local v18 en adelante). Aplicar antes del próximo release.
--
-- Columnas espejo del schema WatermelonDB:
--   id                → PK (generado por Watermelon)
--   plan_id           → FK a plans.id (ON DELETE CASCADE)
--   type              → 'line' | 'calibration' | 'polygon' | 'polyline' | ...
--   data              → JSON stringificado con coordenadas y metadata
--   calibration_scale → píxeles por metro
--   page              → página del PDF
--   created_at / updated_at → timestamps en ms (bigint, coherente con el resto de tablas)

CREATE TABLE IF NOT EXISTS public.plan_measurements (
  id                text PRIMARY KEY,
  plan_id           text NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  type              text NOT NULL,
  data              text NOT NULL,
  calibration_scale numeric NOT NULL,
  page              integer NOT NULL,
  created_at        bigint NOT NULL,
  updated_at        bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS plan_measurements_plan_id_idx
  ON public.plan_measurements(plan_id);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Un usuario puede ver y modificar mediciones si tiene acceso al proyecto del plano.
-- Se alinea con las políticas de plans/plan_annotations.

ALTER TABLE public.plan_measurements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_measurements'
      AND policyname = 'plan_measurements_select'
  ) THEN
    CREATE POLICY plan_measurements_select ON public.plan_measurements
      FOR SELECT USING (
        plan_id IN (
          SELECT pl.id FROM public.plans pl
          JOIN public.user_project_access upa ON upa.project_id = pl.project_id
          WHERE upa.user_id = auth.uid()::text
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_measurements'
      AND policyname = 'plan_measurements_mutate'
  ) THEN
    CREATE POLICY plan_measurements_mutate ON public.plan_measurements
      FOR ALL USING (
        plan_id IN (
          SELECT pl.id FROM public.plans pl
          JOIN public.user_project_access upa ON upa.project_id = pl.project_id
          WHERE upa.user_id = auth.uid()::text
        )
      )
      WITH CHECK (
        plan_id IN (
          SELECT pl.id FROM public.plans pl
          JOIN public.user_project_access upa ON upa.project_id = pl.project_id
          WHERE upa.user_id = auth.uid()::text
        )
      );
  END IF;
END$$;
