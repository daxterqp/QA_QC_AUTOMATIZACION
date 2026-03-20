-- Ejecutar en Supabase SQL Editor
-- Tabla para almacenar push tokens por usuario/dispositivo

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  token text not null,
  platform text not null default 'android', -- 'android' | 'ios'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_user_token_unique unique (user_id, token)
);

-- Índice para consultas por user_id
create index if not exists idx_push_tokens_user_id on push_tokens(user_id);

-- Habilitar RLS (Row Level Security)
alter table push_tokens enable row level security;

-- Policy: permite insert/update/select con anon key (la app usa anon key)
create policy "Allow anon access" on push_tokens
  for all
  using (true)
  with check (true);
