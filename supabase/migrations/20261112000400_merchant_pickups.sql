-- Pedidos para el panel del comercio: pagados por retirar + retirados hoy.
--
-- No se agrega ninguna política RLS sobre orders: una política SELECT para comercios
-- les expondría pickup_code / qr_token (podrían "retirar" sin el cliente) y el email.
-- En su lugar, una RPC security definer que:
--   * solo devuelve pedidos de comercios cuyo owner_id = auth.uid(),
--   * solo expone columnas seguras (sin email, teléfono, QR ni código de retiro).
-- Es seguro correrla varias veces.

create or replace function public.merchant_pickup_orders()
returns table (
  order_id uuid,
  order_number text,
  buyer_name text,
  offer_title text,
  quantity integer,
  total numeric,
  status text,
  pickup_date text,
  pickup_start text,
  pickup_end text,
  paid_at timestamptz,
  redeemed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select b.id::text as business_id
    from public.businesses b
    where b.owner_id = auth.uid()
  ),
  today as (
    select (date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
            at time zone 'America/Argentina/Buenos_Aires') as starts_at
  )
  select
    o.id,
    o.order_number,
    o.user_name,
    o.offer_title,
    o.quantity,
    o.total,
    o.status,
    o.pickup_date,
    o.pickup_start,
    o.pickup_end,
    o.paid_at,
    o.redeemed_at
  from public.orders o
  cross join today t
  where o.merchant_id in (select m.business_id from mine m)
    and (
      o.status = 'paid'
      or (o.status = 'picked_up' and o.redeemed_at >= t.starts_at)
    )
  order by (o.status = 'paid') desc, o.pickup_start asc nulls last, o.redeemed_at desc nulls last
  limit 200;
$$;

revoke all on function public.merchant_pickup_orders() from public, anon;
grant execute on function public.merchant_pickup_orders() to authenticated;

-- Búsquedas del panel y del canje.
create index if not exists orders_merchant_status_idx on public.orders (merchant_id, status);
create index if not exists orders_pickup_code_idx on public.orders (pickup_code) where pickup_code is not null;

-- Configuración del control de horario (no pisa valores existentes).
insert into public.platform_settings (key, value)
values ('pickup_window_enforced', 'true'), ('pickup_tolerance_minutes', '30')
on conflict (key) do nothing;
