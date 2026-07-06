-- Prevent duplicate open shifts when users click Open Shift repeatedly or retry after a slow response.

with ranked_open_device_shifts as (
  select
    id,
    row_number() over (
      partition by tenant_id, branch_id, upper(device_code)
      order by opened_at desc, id desc
    ) as rn
  from shifts
  where status = 'open'
    and device_code is not null
),
ranked_open_branch_shifts as (
  select
    id,
    row_number() over (
      partition by tenant_id, branch_id
      order by opened_at desc, id desc
    ) as rn
  from shifts
  where status = 'open'
    and device_code is null
),
duplicate_open_shifts as (
  select id from ranked_open_device_shifts where rn > 1
  union
  select id from ranked_open_branch_shifts where rn > 1
)
update shifts s
set
  status = 'suspended',
  metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
    'auto_suspended_reason', 'duplicate_open_shift_scope',
    'auto_suspended_at', now()
  ),
  updated_at = now()
from duplicate_open_shifts d
where s.id = d.id;

create unique index if not exists uq_shifts_open_device_code_scope
  on shifts(tenant_id, branch_id, upper(device_code))
  where status = 'open'
    and device_code is not null;

create unique index if not exists uq_shifts_open_branch_without_device_scope
  on shifts(tenant_id, branch_id)
  where status = 'open'
    and device_code is null;
