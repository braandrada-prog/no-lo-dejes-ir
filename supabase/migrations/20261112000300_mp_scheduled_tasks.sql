-- Tareas programadas de pagos (pg_cron + pg_net) y RPC del entorno activo.
--
-- Requisitos (una sola vez, desde el SQL Editor; NO se guardan en el repo):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<mismo valor que el secreto NLID_TASK_TOKEN>', 'nlid_task_token');
--
-- Las funciones invocadas (releaseExpiredOrders, mpReconcile, mpRefreshTokens) se despliegan
-- con verify_jwt = false y validan el header x-nlid-task-token.
-- Es seguro correrla varias veces.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Invocación de Edge Functions desde cron, leyendo credenciales del Vault ─────
create or replace function public.nlid_invoke_task(function_name text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text;
  task_token text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into task_token from vault.decrypted_secrets where name = 'nlid_task_token' limit 1;

  if base_url is null or task_token is null then
    raise warning 'nlid_invoke_task: faltan los secretos project_url / nlid_task_token en el Vault';
    return null;
  end if;

  return net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-nlid-task-token', task_token
    ),
    body := payload,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.nlid_invoke_task(text, jsonb) from public, anon, authenticated;

-- ── Programación (se reprograma si ya existía) ─────────────────────────────────
do $$
declare
  job record;
begin
  for job in
    select jobid from cron.job
    where jobname in ('nlid-release-expired-orders', 'nlid-mp-reconcile', 'nlid-mp-refresh-tokens')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

-- Libera reservas impagas vencidas y expira publicaciones.
select cron.schedule(
  'nlid-release-expired-orders',
  '*/5 * * * *',
  $$ select public.nlid_invoke_task('releaseExpiredOrders'); $$
);

-- Concilia pedidos pendientes contra Mercado Pago (webhooks perdidos).
select cron.schedule(
  'nlid-mp-reconcile',
  '*/10 * * * *',
  $$ select public.nlid_invoke_task('mpReconcile'); $$
);

-- Renueva los tokens OAuth de comercios que vencen en menos de 7 días.
select cron.schedule(
  'nlid-mp-refresh-tokens',
  '17 4 * * *',
  $$ select public.nlid_invoke_task('mpRefreshTokens', '{"window_days": 7}'::jsonb); $$
);

-- ── Entorno de cobro activo (no es secreto; lo usa el panel de administración) ──
create or replace function public.mp_active_environment()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select lower(trim(value)) from public.platform_settings where key = 'mp_environment'),
    'test'
  );
$$;

revoke all on function public.mp_active_environment() from public, anon;
grant execute on function public.mp_active_environment() to authenticated;

-- ── Índices de apoyo para la conciliación por comercio ─────────────────────────
create index if not exists orders_collector_id_idx on public.orders (collector_id) where collector_id is not null;
create index if not exists orders_pending_payment_idx on public.orders (status, created_at) where status = 'pending_payment';
