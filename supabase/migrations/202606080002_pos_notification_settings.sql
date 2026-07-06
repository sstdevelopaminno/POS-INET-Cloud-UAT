create table if not exists public.tenant_pos_notification_settings (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  table_qr_popup_enabled boolean not null default true,
  table_qr_sound_enabled boolean not null default true,
  table_qr_sound_volume numeric(4,2) not null default 0.8 check (table_qr_sound_volume >= 0 and table_qr_sound_volume <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, branch_id)
);

create index if not exists idx_tenant_pos_notification_settings_scope
  on public.tenant_pos_notification_settings(tenant_id, branch_id);

drop trigger if exists trg_tenant_pos_notification_settings_touch on public.tenant_pos_notification_settings;
create trigger trg_tenant_pos_notification_settings_touch
before update on public.tenant_pos_notification_settings
for each row execute function app.touch_updated_at();

alter table public.tenant_pos_notification_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_pos_notification_settings'
      and policyname = 'tenant_pos_notification_settings_isolation'
  ) then
    create policy tenant_pos_notification_settings_isolation
    on public.tenant_pos_notification_settings
    for all
    using (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin())
    with check (app.has_branch_access(tenant_id, branch_id) or app.is_it_admin());
  end if;
end $$;
