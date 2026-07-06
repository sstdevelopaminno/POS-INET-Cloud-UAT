-- Enforce one active payment account per payment scope.
-- Branch-specific accounts must override tenant-wide accounts at runtime, but each
-- scope should still have only one active account to avoid ambiguous QR selection.

with ranked_branch_accounts as (
  select
    id,
    row_number() over (
      partition by tenant_id, branch_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from tenant_payment_accounts
  where is_active = true
    and applies_to_all_branches = false
)
update tenant_payment_accounts
set is_active = false
where id in (
  select id
  from ranked_branch_accounts
  where rn > 1
);

with ranked_tenant_accounts as (
  select
    id,
    row_number() over (
      partition by tenant_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from tenant_payment_accounts
  where is_active = true
    and applies_to_all_branches = true
)
update tenant_payment_accounts
set is_active = false
where id in (
  select id
  from ranked_tenant_accounts
  where rn > 1
);

create unique index if not exists uq_tenant_payment_accounts_active_branch_scope
on tenant_payment_accounts(tenant_id, branch_id)
where is_active = true
  and applies_to_all_branches = false;

create unique index if not exists uq_tenant_payment_accounts_active_tenant_scope
on tenant_payment_accounts(tenant_id)
where is_active = true
  and applies_to_all_branches = true;
