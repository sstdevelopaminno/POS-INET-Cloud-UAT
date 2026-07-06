-- Harden active POS session uniqueness per device scope.
-- Goal:
-- 1) Prevent race condition that can create >1 active session on same device.
-- 2) Keep tenant/branch/device isolation strict under concurrent login traffic.

-- Cleanup any legacy duplicates first so unique indexes can be created safely.
with ranked_by_device_id as (
  select
    id,
    row_number() over (
      partition by tenant_id, branch_id, device_id
      order by issued_at desc, created_at desc, id desc
    ) as rn
  from pos_sessions
  where status = 'active'
    and device_id is not null
),
to_revoke as (
  select id
  from ranked_by_device_id
  where rn > 1
)
update pos_sessions ps
set
  status = 'revoked',
  revoked_at = now(),
  metadata = coalesce(ps.metadata, '{}'::jsonb) || jsonb_build_object('auto_revoked_reason', 'duplicate_active_session_device_id')
where ps.id in (select id from to_revoke);

with ranked_by_device_code as (
  select
    id,
    row_number() over (
      partition by tenant_id, branch_id, upper(device_code)
      order by issued_at desc, created_at desc, id desc
    ) as rn
  from pos_sessions
  where status = 'active'
    and device_code is not null
),
to_revoke as (
  select id
  from ranked_by_device_code
  where rn > 1
)
update pos_sessions ps
set
  status = 'revoked',
  revoked_at = now(),
  metadata = coalesce(ps.metadata, '{}'::jsonb) || jsonb_build_object('auto_revoked_reason', 'duplicate_active_session_device_code')
where ps.id in (select id from to_revoke);

create unique index if not exists uq_pos_sessions_device_id_active_scope
  on pos_sessions(tenant_id, branch_id, device_id)
  where status = 'active' and device_id is not null;

create unique index if not exists uq_pos_sessions_device_code_active_scope
  on pos_sessions(tenant_id, branch_id, upper(device_code))
  where status = 'active' and device_code is not null;
