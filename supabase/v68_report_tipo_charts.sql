-- v68 — Reportes por Correo: el modelo apunta a un TIPO de ensayo (la Tabla Resumen es por tipo)
-- y guarda su config de gráficos (configurables, no en localStorage).
alter table public.report_templates add column if not exists report_tipo  text;   -- id_protocolo objetivo
alter table public.report_templates add column if not exists charts_json   jsonb; -- [{ yKey, type:'line'|'bars', label? }]
