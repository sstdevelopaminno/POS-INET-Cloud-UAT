-- Transfer slip verification persistence (text-first, no image blob)
alter type approval_action add value if not exists 'transfer_payment_override';

create table if not exists transfer_payment_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  verified_by uuid not null references users_profiles(id),
  verification_status text not null check (verification_status in ('passed', 'failed', 'override_passed', 'error')),
  expected_amount numeric(12,2) not null default 0,
  expected_promptpay_phone text,
  expected_payee_name text,
  parsed_payer_name text,
  parsed_payee_name text,
  parsed_amount numeric(12,2),
  parsed_transfer_datetime text,
  parsed_transaction_id text,
  parsed_reference_no text,
  ocr_confidence numeric(6,4),
  checks jsonb not null default '{}'::jsonb,
  parsed_payload jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  error_code text,
  error_message text,
  override_approval_id uuid references manager_pin_approvals(id),
  override_by uuid references users_profiles(id),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transfer_payment_verifications_order
  on transfer_payment_verifications(tenant_id, branch_id, order_id, verified_at desc);

create index if not exists idx_transfer_payment_verifications_status
  on transfer_payment_verifications(tenant_id, branch_id, verification_status, created_at desc);

drop trigger if exists trg_transfer_payment_verifications_touch on transfer_payment_verifications;

create trigger trg_transfer_payment_verifications_touch
before update on transfer_payment_verifications
for each row execute function app.touch_updated_at();

alter table if exists payments
  add column if not exists transfer_verification_id uuid references transfer_payment_verifications(id),
  add column if not exists transfer_override_approval_id uuid references manager_pin_approvals(id);

alter table if exists transfer_payment_verifications enable row level security;

drop policy if exists transfer_payment_verifications_isolation on transfer_payment_verifications;

create policy transfer_payment_verifications_isolation
on transfer_payment_verifications
for all
using (app.has_branch_access(tenant_id, branch_id))
with check (app.has_branch_access(tenant_id, branch_id));
