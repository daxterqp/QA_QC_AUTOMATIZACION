-- v99 — Motivo de aprobación POR NIVEL (auditoría de aprobaciones 19-jul-2026).
-- Aplicada en Supabase vía MCP (migración v99_approval_reason_per_level).
-- El motivo obligatorio de "aprobar con observación" de los niveles intermedios
-- se descartaba (solo el último nivel lo escribía en protocols.approval_reason);
-- ahora cada fila de protocol_approvals conserva el suyo.
ALTER TABLE public.protocol_approvals ADD COLUMN IF NOT EXISTS approval_reason TEXT;
