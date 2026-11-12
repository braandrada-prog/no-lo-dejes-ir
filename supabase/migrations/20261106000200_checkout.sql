-- Columnas que usa createCheckout al crear el pedido.
-- "add column if not exists" no toca las columnas que ya tengas (conservan su tipo).
 
alter table public.orders
  add column if not exists order_number text,
  add column if not exists user_email text,
  add column if not exists user_name text,
  add column if not exists user_phone text,
  add column if not exists offer_id uuid,
  add column if not exists offer_title text,
  add column if not exists image_url text,
  add column if not exists business_id text,
  add column if not exists merchant_id text,
  add column if not exists branch_id text,
  add column if not exists business_name text,
  add column if not exists business_address text,
  add column if not exists business_phone text,
  add column if not exists city text,
  add column if not exists quantity integer,
  add column if not exists unit_price numeric,
  add column if not exists total numeric,
  add column if not exists savings numeric,
  add column if not exists commission_rate numeric,
  add column if not exists payment_provider text,
  add column if not exists pickup_date text,
  add column if not exists pickup_start text,
  add column if not exists pickup_end text,
  add column if not exists idempotency_key text,
  add column if not exists preference_id text,
  add column if not exists init_point text,
  add column if not exists created_by_id uuid;
 
-- Idempotencia real: un mismo usuario no puede crear dos pedidos con la misma clave,
-- aunque haga doble clic y lleguen dos solicitudes a la vez.
create unique index if not exists orders_user_idempotency_key
  on public.orders (user_email, idempotency_key)
  where idempotency_key is not null;