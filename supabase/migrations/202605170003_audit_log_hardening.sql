-- Hardening phase v0.1.1: audit log persistence schema
-- Keeps backward compatibility with existing audit_logs columns while adding
-- normalized fields required for production-grade forensic traces.

alter table if exists audit_logs
  add column if not exists user_id uuid references users_profiles(id),
  add column if not exists role text,
  add column if not exists module text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists before_data jsonb not null default '{}'::jsonb,
  add column if not exists after_data jsonb not null default '{}'::jsonb,
  add column if not exists override_by_user_id uuid references users_profiles(id),
  add column if not exists ip_address inet,
  add column if not exists user_agent text;

-- Backfill newly added columns from legacy fields where possible.
update audit_logs
set
  user_id = coalesce(user_id, actor_user_id),
  role = coalesce(role, actor_role),
  module = coalesce(module, split_part(action, '_', 1)),
  entity_type = coalesce(entity_type, target_table),
  entity_id = coalesce(entity_id, target_id::text),
  after_data = coalesce(after_data, metadata, '{}'::jsonb)
where
  user_id is null
  or role is null
  or module is null
  or entity_type is null
  or entity_id is null
  or after_data is null;

create index if not exists idx_audit_logs_module_action_created
  on audit_logs(module, action, created_at desc);

create index if not exists idx_audit_logs_entity
  on audit_logs(entity_type, entity_id);
