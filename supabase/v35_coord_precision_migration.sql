-- v35 — Captura GPS de precisión (promediado de waypoints).
-- Ejecutar en el SQL Editor de Supabase.
--
-- Guarda CÓMO se capturó el punto y su calidad:
--   coord_method      'single' | 'averaged' | 'rtk'
--   coord_sample_count  nº de muestras promediadas (averaged)
--   coord_precision_m   precisión estimada del punto promediado (± m, 1σ)
-- coord_accuracy_m sigue guardando la confianza (= coord_precision_m en averaged).

ALTER TABLE protocols ADD COLUMN IF NOT EXISTS coord_method       text;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS coord_sample_count integer;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS coord_precision_m  double precision;
