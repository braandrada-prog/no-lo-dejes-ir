-- Comisión configurable por comercio (override del valor global de platform_settings).
-- null = usa la comisión global (`commission_percent`, por defecto 15%).
-- Es seguro correrla varias veces.

alter table public.businesses
  add column if not exists commission_rate numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'businesses_commission_rate_range'
  ) then
    alter table public.businesses
      add constraint businesses_commission_rate_range
      check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 60));
  end if;
end $$;

insert into public.platform_settings (key, value)
values ('commission_percent', '15')
on conflict (key) do nothing;
