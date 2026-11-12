-- Vinculación OAuth de comercios con Mercado Pago (modelo Marketplace / split).
--
-- Seguridad:
--  * Los tokens se guardan CIFRADOS (AES-GCM) por las Edge Functions con el secreto
--    MP_TOKEN_ENC_KEY. La base nunca ve el access_token ni el refresh_token en claro.
--  * Las dos tablas tienen RLS activo y NINGUNA política: solo la clave de servicio
--    (Edge Functions) puede leerlas o escribirlas.
--  * El comercio consulta su estado con la RPC my_mp_connection(), que nunca devuelve tokens.
--
-- Es seguro correrla varias veces.

-- ── Credenciales por comercio y entorno ─────────────────────────────────────────
create table if not exists public.merchant_mp_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  environment text not null default 'test' check (environment in ('test', 'production')),
  mp_user_id text not null,
  access_token_enc text,
  refresh_token_enc text,
  public_key text,
  scope text,
  live_mode boolean not null default false,
  expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'expired', 'revoked')),
  connected_by uuid,
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists merchant_mp_accounts_business_env_key
  on public.merchant_mp_accounts (business_id, environment);

create index if not exists merchant_mp_accounts_mp_user_idx
  on public.merchant_mp_accounts (mp_user_id, environment);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists merchant_mp_accounts_touch on public.merchant_mp_accounts;
create trigger merchant_mp_accounts_touch
  before update on public.merchant_mp_accounts
  for each row execute function public.touch_updated_at();

-- ── Estados OAuth (anti-CSRF + PKCE), de un solo uso y con vencimiento ─────────
create table if not exists public.mp_oauth_states (
  state text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null,
  environment text not null default 'test' check (environment in ('test', 'production')),
  code_verifier text not null,
  return_path text,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mp_oauth_states_expires_idx on public.mp_oauth_states (expires_at);

-- ── RLS: solo service role ──────────────────────────────────────────────────────
alter table public.merchant_mp_accounts enable row level security;
alter table public.mp_oauth_states enable row level security;

revoke all on public.merchant_mp_accounts from anon, authenticated;
revoke all on public.mp_oauth_states from anon, authenticated;

-- ── Estado de conexión visible para el dueño del comercio (sin tokens) ─────────
create or replace function public.my_mp_connection()
returns table (
  business_id uuid,
  environment text,
  connected boolean,
  status text,
  mp_user_id text,
  live_mode boolean,
  expires_at timestamptz,
  connected_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with env as (
    select coalesce(
      (select lower(trim(value)) from public.platform_settings where key = 'mp_environment'),
      'test'
    ) as name
  )
  select
    b.id as business_id,
    env.name as environment,
    (a.status = 'connected') is true as connected,
    coalesce(a.status, 'disconnected') as status,
    a.mp_user_id,
    coalesce(a.live_mode, false) as live_mode,
    a.expires_at,
    a.connected_at
  from public.businesses b
  cross join env
  left join public.merchant_mp_accounts a
    on a.business_id = b.id and a.environment = env.name
  where b.owner_id = auth.uid();
$$;

revoke all on function public.my_mp_connection() from public, anon;
grant execute on function public.my_mp_connection() to authenticated;

-- ── Estado de conexión de todos los comercios, solo para administradores ───────
create or replace function public.admin_mp_connections()
returns table (
  business_id uuid,
  environment text,
  status text,
  mp_user_id text,
  live_mode boolean,
  expires_at timestamptz,
  connected_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.business_id, a.environment, a.status, a.mp_user_id, a.live_mode, a.expires_at, a.connected_at
  from public.merchant_mp_accounts a
  where exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.admin_mp_connections() from public, anon;
grant execute on function public.admin_mp_connections() to authenticated;

-- ── Datos del split en el pedido ───────────────────────────────────────────────
alter table public.orders
  add column if not exists collector_id text,
  add column if not exists marketplace_fee numeric;
