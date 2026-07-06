-- Shift gate normalization + pos_session shift binding hardening

do $$
begin
  begin
    alter type shift_status add value if not exists 'suspended';
  exception
    when duplicate_object then null;
  end;
end $$;

alter table if exists shifts
  add column if not exists device_code text,
  add column if not exists closing_cash numeric(12,2),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists shifts
  alter column opening_cash drop not null;

update shifts
set metadata = '{}'::jsonb
where metadata is null;

create index if not exists idx_shifts_scope_opened_at on shifts(tenant_id, branch_id, opened_at desc);
create index if not exists idx_shifts_status on shifts(status, opened_at desc);
create index if not exists idx_shifts_opened_by on shifts(opened_by, opened_at desc);
create index if not exists idx_shifts_device_code on shifts(device_code, opened_at desc);
create index if not exists idx_shifts_opened_at on shifts(opened_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_shifts_touch'
      and tgrelid = 'public.shifts'::regclass
  ) then
    create trigger trg_shifts_touch
    before update on shifts
    for each row execute function app.touch_updated_at();
  end if;
end $$;

do $$
begin
  alter table if exists pos_sessions
    add column if not exists shift_id uuid;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sessions_shift_id_fkey'
      and conrelid = 'public.pos_sessions'::regclass
  ) then
    alter table pos_sessions
      add constraint pos_sessions_shift_id_fkey
      foreign key (shift_id) references shifts(id) on delete set null;
  end if;
end $$;
