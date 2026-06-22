-- Añade columna priority a plan_annotations en Supabase
-- Schema local v19. Aplicar antes de lanzar la app a usuarios.
--
-- Valores válidos: 'low' | 'medium' | 'high' | NULL (sin prioridad)
-- Nullable: la mayoría de anotaciones existentes no tienen prioridad.

ALTER TABLE public.plan_annotations
  ADD COLUMN IF NOT EXISTS priority text NULL;

-- Constraint opcional para evitar valores inválidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plan_annotations_priority_check'
  ) THEN
    ALTER TABLE public.plan_annotations
      ADD CONSTRAINT plan_annotations_priority_check
      CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high'));
  END IF;
END$$;
