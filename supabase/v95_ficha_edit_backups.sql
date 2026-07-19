-- v95 — Respaldos de EDICIÓN DE FICHAS (flujo de edición directa de templates).
-- Aplicada en Supabase el 2026-07-19 vía MCP (migración v95_ficha_edit_backups).
-- Cada operación de edición guarda ANTES un snapshot completo (template +
-- template_items + protocol_items de TODAS las instancias + summary rows) para
-- poder restaurar con un UPDATE. RLS habilitado SIN políticas: solo el service
-- role (herramientas de mantenimiento) puede leer/escribir — invisible para
-- las apps móvil/web. Runbook: docs/FLUJO_EDICION_FICHAS.md
create table if not exists public.ficha_edit_backups (
  id uuid primary key default gen_random_uuid(),
  template_id text not null,
  project_id text,
  label text not null,
  operation text,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  snapshot jsonb not null
);
create index if not exists idx_ficha_backups_template on public.ficha_edit_backups(template_id, created_at desc);
alter table public.ficha_edit_backups enable row level security;
