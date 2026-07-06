-- Backward-compatible audit_logs schema fix for environments that missed
-- later audit columns. Safe and idempotent.

alter table if exists audit_logs
  add column if not exists actor_user_id uuid,
  add column if not exists target_user_id uuid,
  add column if not exists pos_session_id uuid,
  add column if not exists device_code text,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists old_value jsonb,
  add column if not exists new_value jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists ip_address text,
  add column if not exists user_agent text;

create index if not exists idx_audit_logs_tenant_id on audit_logs(tenant_id);
create index if not exists idx_audit_logs_branch_id on audit_logs(branch_id);
create index if not exists idx_audit_logs_actor_user_id on audit_logs(actor_user_id);
create index if not exists idx_audit_logs_target_user_id on audit_logs(target_user_id);
create index if not exists idx_audit_logs_pos_session_id on audit_logs(pos_session_id);
create index if not exists idx_audit_logs_action on audit_logs(action);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at desc);
