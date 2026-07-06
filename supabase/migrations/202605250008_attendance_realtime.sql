-- Attendance realtime foundation for POS owner/manager visibility.

create table if not exists staff_attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid not null references users_profiles(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('scheduled', 'checked_in', 'late', 'absent', 'on_leave', 'checked_out', 'manual_adjusted')),
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  source text not null default 'system',
  note text,
  approved_by uuid references users_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, user_id, attendance_date)
);

create table if not exists staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid not null references users_profiles(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  approved_by uuid references users_profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists staff_attendance_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  user_id uuid not null references users_profiles(id) on delete cascade,
  event_type text not null,
  event_at timestamptz not null default now(),
  device_code text,
  shift_id uuid references shifts(id) on delete set null,
  pos_session_id uuid references pos_sessions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_attendance_records_scope_date
  on staff_attendance_records(tenant_id, branch_id, attendance_date, status);
create index if not exists idx_staff_attendance_records_user_date
  on staff_attendance_records(user_id, attendance_date desc);
create index if not exists idx_staff_attendance_records_created
  on staff_attendance_records(tenant_id, branch_id, created_at desc);

create index if not exists idx_staff_leave_requests_scope_dates
  on staff_leave_requests(tenant_id, branch_id, start_date, end_date, status);
create index if not exists idx_staff_leave_requests_user
  on staff_leave_requests(user_id, created_at desc);

create index if not exists idx_staff_attendance_events_scope_event_at
  on staff_attendance_events(tenant_id, branch_id, event_at desc);
create index if not exists idx_staff_attendance_events_user_event_at
  on staff_attendance_events(user_id, event_at desc);
create index if not exists idx_staff_attendance_events_session
  on staff_attendance_events(pos_session_id, event_at desc);

alter table staff_attendance_records enable row level security;
alter table staff_leave_requests enable row level security;
alter table staff_attendance_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_staff_attendance_records_touch'
      and tgrelid = 'public.staff_attendance_records'::regclass
  ) then
    create trigger trg_staff_attendance_records_touch
    before update on staff_attendance_records
    for each row execute function app.touch_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_staff_leave_requests_touch'
      and tgrelid = 'public.staff_leave_requests'::regclass
  ) then
    create trigger trg_staff_leave_requests_touch
    before update on staff_leave_requests
    for each row execute function app.touch_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_attendance_records'
      and policyname = 'staff_attendance_records_select_self_or_branch_manage'
  ) then
    create policy staff_attendance_records_select_self_or_branch_manage
    on staff_attendance_records
    for select
    using (
      app.is_it_admin()
      or user_id = auth.uid()
      or app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_attendance_records'
      and policyname = 'staff_attendance_records_manage'
  ) then
    create policy staff_attendance_records_manage
    on staff_attendance_records
    for all
    using (
      app.is_it_admin()
      or app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
    )
    with check (
      app.is_it_admin()
      or app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_leave_requests'
      and policyname = 'staff_leave_requests_select_self_or_branch_manage'
  ) then
    create policy staff_leave_requests_select_self_or_branch_manage
    on staff_leave_requests
    for select
    using (
      app.is_it_admin()
      or user_id = auth.uid()
      or app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_leave_requests'
      and policyname = 'staff_leave_requests_insert_self_or_manage'
  ) then
    create policy staff_leave_requests_insert_self_or_manage
    on staff_leave_requests
    for insert
    with check (
      app.is_it_admin()
      or user_id = auth.uid()
      or app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_leave_requests'
      and policyname = 'staff_leave_requests_manage'
  ) then
    create policy staff_leave_requests_manage
    on staff_leave_requests
    for update
    using (
      app.is_it_admin()
      or app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
    )
    with check (
      app.is_it_admin()
      or app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_attendance_events'
      and policyname = 'staff_attendance_events_select_self_or_branch_manage'
  ) then
    create policy staff_attendance_events_select_self_or_branch_manage
    on staff_attendance_events
    for select
    using (
      app.is_it_admin()
      or user_id = auth.uid()
      or app.has_role(tenant_id, branch_id, array['owner', 'manager']::branch_role[])
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_attendance_events'
      and policyname = 'staff_attendance_events_insert_scope'
  ) then
    create policy staff_attendance_events_insert_scope
    on staff_attendance_events
    for insert
    with check (
      app.is_it_admin()
      or app.has_branch_access(tenant_id, branch_id)
    );
  end if;
end $$;
