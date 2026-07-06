# RLS Verification Checklist

## Tenant Isolation
- [ ] Tenant A cannot read Tenant B resources (orders, shifts, users, devices, policies).
- [ ] Tenant-scoped APIs reject cross-tenant IDs.

## Branch Isolation
- [ ] Manager in Branch A cannot read Branch B data in same tenant unless explicitly allowed.
- [ ] Staff in Branch A cannot query Branch B attendance/orders/devices.

## Role Restrictions
- [ ] Staff cannot manage device or login policy.
- [ ] Staff cannot perform manager/owner-only attendance overrides.

## Attendance Access
- [ ] Staff sees self attendance only.
- [ ] Manager/owner can view branch attendance summary/list only in allowed scope.

## Public/Safe Endpoints
- [ ] Public store resolve returns only safe data (no service-role leakage, no sensitive internals).

## Service-role Route Controls
- [ ] Service-role-backed routes validate tenant and branch manually server-side.
- [ ] Client-sent tenant/branch identifiers are never trusted without server re-resolution.

## Regression Spot Checks
- [ ] Login context replay still blocked.
- [ ] Feature gates still enforce server-side.
- [ ] Quota checks still block over-limit provisioning.
