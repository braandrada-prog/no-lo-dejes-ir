-- Pagos, conciliación y configuración de plataforma.
-- Es seguro correrla varias veces: solo agrega lo que falta.
 
alter table public.orders
  add column if not exists payment_status text,
  add column if not exists payment_id text,
  add column if not exists payment_method text,
  add column if not exists payment_environment text,
  add column if not exists paid_at timestamptz,
  add column if not exists stock_state text,
  add column if not exists settlement_status text,
  add column if not exists qr_token text,
  add column if not exists qr_issued_at timestamptz,
  add column if not exists pickup_code text,
  add column if not exists pickup_channel text,
  add column if not exists redeemed_at timestamptz,
  add column if not exists redeemed_by text,
  add column if not exists refund_required boolean not null default false,
  add column if not exists refund_reason text,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_amount numeric,
  add column if not exists duplicate_payment_ids jsonb not null default '[]'::jsonb,
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists reserved_until timestamptz,
  add column if not exists commission_amount numeric not null default 0,
  add column if not exists net_to_merchant numeric not null default 0;
 
-- Un mismo QR no puede existir en dos pedidos.
create unique index if not exists orders_qr_token_key
  on public.orders (qr_token) where qr_token is not null;
 
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercadopago',
  environment text not null default 'test',
  kind text not null,
  order_id uuid,
  order_number text,
  payment_id text,
  preference_id text,
  provider_status text,
  provider_status_detail text,
  amount numeric not null default 0,
  currency text not null default 'ARS',
  dedupe_key text,
  source text not null default 'system',
  actor_email text,
  detail text,
  created_at timestamptz not null default now()
);
 
create index if not exists payment_transactions_dedupe_key_idx on public.payment_transactions (dedupe_key);
create index if not exists payment_transactions_order_id_idx on public.payment_transactions (order_id);
 
create table if not exists public.platform_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
 
insert into public.platform_settings (key, value)
values ('mp_environment', 'test')
on conflict (key) do nothing;
 
-- Solo el backend (clave de servicio) accede: RLS activo y sin políticas.
-- Ojo: platform_settings puede contener 'task_token'. No le des lectura pública.
alter table public.payment_transactions enable row level security;
alter table public.platform_settings enable row level security;