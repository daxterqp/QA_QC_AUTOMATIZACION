-- v61 — Backstop de unicidad para el código de muestra (paridad con protocols_code_uniq_per_project).
-- La revisión adversarial detectó que `samples` no tenía UNIQUE sobre el código → dos dispositivos
-- (PC/móvil) podían crear el mismo sample_code (seq calculado client-side, sin árbitro atómico).
-- Este índice es el backstop a nivel DB; el cliente (useCreateSample / móvil) reintenta ante 23505.
create unique index if not exists samples_code_uniq_per_project
  on public.samples(project_id, sample_code)
  where sample_code is not null;
