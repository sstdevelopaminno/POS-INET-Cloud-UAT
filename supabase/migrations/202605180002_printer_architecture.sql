-- Printer Adapter Architecture + Queue
-- Supports: NETWORK_ESC_POS, STAR_WEBPRNT, LOCAL_BRIDGE

do $$
begin
  if not exists (select 1 from pg_type where typname = 'printer_connection_type') then
    create type printer_connection_type as enum ('NETWORK_ESC_POS', 'STAR_WEBPRNT', 'LOCAL_BRIDGE');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'printer_role') then
    create type printer_role as enum ('receipt', 'kitchen', 'report');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'print_job_status') then
    create type print_job_status as enum ('pending', 'printing', 'printed', 'failed', 'retrying');
  end if;
end $$;

create table if not exists printer_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  printer_name text not null,
  printer_role printer_role not null,
  connection_type printer_connection_type not null,
  ip_address text,
  port integer,
  paper_width_mm integer not null check (paper_width_mm in (58, 80)),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, printer_name)
);

create table if not exists print_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  printer_id uuid references printer_profiles(id) on delete set null,
  printer_role printer_role not null,
  connection_type printer_connection_type not null,
  status print_job_status not null default 'pending',
  payload_text text not null,
  payload_json jsonb not null default '{}'::jsonb,
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retry_count integer not null default 3 check (max_retry_count >= 0),
  last_error text,
  printed_at timestamptz,
  failed_at timestamptz,
  created_by uuid references users_profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_printer_profiles_tenant_branch
  on printer_profiles(tenant_id, branch_id);

create index if not exists idx_print_jobs_tenant_branch_status
  on print_jobs(tenant_id, branch_id, status, created_at desc);

create index if not exists idx_print_jobs_order_id
  on print_jobs(order_id);
