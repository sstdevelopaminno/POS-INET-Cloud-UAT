-- Branch policy flag for device registration enforcement in secure login flow.

alter table branch_login_policies
  add column if not exists require_registered_device boolean not null default true;
