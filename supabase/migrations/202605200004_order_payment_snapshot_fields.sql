alter table if exists orders
  add column if not exists cash_received numeric(12,2),
  add column if not exists change_amount numeric(12,2),
  add column if not exists payment_completed_at timestamptz,
  add column if not exists payment_completed_by uuid references users_profiles(id);
