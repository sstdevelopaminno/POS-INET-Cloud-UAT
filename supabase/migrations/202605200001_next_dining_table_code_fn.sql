-- Fast next table-code lookup for table management API

create or replace function app.next_dining_table_code(
  p_tenant_id uuid,
  p_branch_id uuid
) returns text
language sql
stable
as $$
  select (coalesce(max((code_match)[1]::bigint), 0) + 1)::text
  from dining_tables dt
  left join lateral regexp_match(trim(dt.table_code), '(\d+)(?!.*\d)') as code_match on true
  where dt.tenant_id = p_tenant_id
    and dt.branch_id = p_branch_id;
$$;

grant execute on function app.next_dining_table_code(uuid, uuid) to authenticated, service_role;
