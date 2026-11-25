-- Invocaciones de tareas programadas firmadas con HMAC-SHA256.
--
-- Antes: nlid_invoke_task() enviaba la clave en texto plano (header x-nlid-task-token).
-- Ahora: envía solo una firma que vence y está atada a la función destino:
--
--   x-nlid-signature: t=<unix ms>,v1=<hex HMAC-SHA256(clave, '<t>.<function_name>')>
--
-- La clave sigue siendo el secreto del Vault `nlid_task_token`, con el MISMO valor que el
-- secreto NLID_TASK_TOKEN de las Edge Functions (no hace falta crear nada nuevo).
-- Las funciones verifican la firma en supabase/functions/_shared/auth.ts (isTaskAuthorized).
--
-- Orden de despliegue: aplicar esta migración y desplegar las Edge Functions
-- releaseExpiredOrders, mpReconcile y mpRefreshTokens en la misma ventana.
-- Es seguro correrla varias veces.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.nlid_invoke_task(function_name text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_url text;
  signing_key text;
  ts text;
  signature text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into signing_key from vault.decrypted_secrets where name = 'nlid_task_token' limit 1;

  if base_url is null or signing_key is null then
    raise warning 'nlid_invoke_task: faltan los secretos project_url / nlid_task_token en el Vault';
    return null;
  end if;

  ts := floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  signature := encode(extensions.hmac(ts || '.' || function_name, signing_key, 'sha256'), 'hex');

  return net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-nlid-signature', 't=' || ts || ',v1=' || signature
    ),
    body := payload,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.nlid_invoke_task(text, jsonb) from public, anon, authenticated;
