-- Payment account QR mode controls for POS transfer payments.

alter table tenant_payment_accounts
  add column if not exists qr_mode text not null default 'promptpay_link',
  add column if not exists applies_to_all_branches boolean not null default false;

alter table tenant_payment_accounts
  drop constraint if exists tenant_payment_accounts_qr_mode_check;

alter table tenant_payment_accounts
  add constraint tenant_payment_accounts_qr_mode_check
  check (qr_mode in ('promptpay_link', 'qr_image'));

create index if not exists idx_tenant_payment_accounts_active_scope_mode
on tenant_payment_accounts(tenant_id, branch_id, applies_to_all_branches, is_active);
