-- Speed up POS settings cashier-device list queries.

create index if not exists idx_branch_devices_tenant_device_code
on branch_devices(tenant_id, device_code);
