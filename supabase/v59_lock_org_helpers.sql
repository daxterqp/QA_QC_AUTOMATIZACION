-- ============================================================================
-- v59 — Hardening: cerrar helpers org a anon + bloquear backup legacy de passwords
-- ============================================================================
-- Cierra dos hallazgos del advisor tras v56:
--  1) Las funciones nuevas (auth_org/is_org_admin/set_org_id) se otorgan a PUBLIC por
--     defecto → anon podía ejecutarlas vía /rest/v1/rpc. Revocamos public/anon (igual que v49).
--     - set_org_id es función de TRIGGER: nadie debe llamarla por RPC → revocada también a authenticated
--       (los triggers corren como definer sin importar el EXECUTE grant).
--     - auth_org/is_org_admin las usan las políticas RLS evaluadas como `authenticated` → se mantiene ese grant.
--  2) `_backup_users_pwd_pin` (backup que dejó v53_drop_legacy_password_pin) estaba EXPUESTA por
--     PostgREST sin RLS y contiene `password` legacy → ERROR del linter. Enable RLS sin políticas =
--     solo service_role/dashboard. (Cuando estés tranquilo, podés DROPEAR la tabla del todo.)
-- ============================================================================

revoke all on function public.auth_org()       from public, anon;
revoke all on function public.is_org_admin()    from public, anon;
revoke all on function public.set_org_id()      from public, anon, authenticated;
grant execute on function public.auth_org()     to authenticated;
grant execute on function public.is_org_admin() to authenticated;

do $$
begin
  if to_regclass('public._backup_users_pwd_pin') is not null then
    execute 'alter table public._backup_users_pwd_pin enable row level security';
  end if;
end $$;
