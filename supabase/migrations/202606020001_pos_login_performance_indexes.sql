-- Speed up POS login/device selection under accumulated session history.
-- These partial indexes target the active-session lookups and revokes used by
-- /api/auth/devices and /api/auth/devices/select.

create index if not exists idx_pos_sessions_active_device_id_lookup
  on pos_sessions(tenant_id, branch_id, device_id, expires_at desc)
  where status = 'active' and device_id is not null;

create index if not exists idx_pos_sessions_active_device_code_lookup
  on pos_sessions(tenant_id, branch_id, device_code, expires_at desc)
  where status = 'active' and device_code is not null;

create index if not exists idx_pos_sessions_active_user_lookup
  on pos_sessions(tenant_id, branch_id, user_id, expires_at desc)
  where status = 'active';
