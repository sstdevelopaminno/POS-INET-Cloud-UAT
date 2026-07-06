# POS Multi-Branch Load Test Report

- Generated at: `2026-05-24T10:59:34.987Z`
- Target: `http://localhost:3000`
- Duration: `30s`
- Concurrency: `20`
- Request timeout: `12000ms`

## Totals

- Requests: `379`
- Success: `359`
- Failed: `20`
- Error rate: `5.28%`
- Throughput: `12.63 req/s`
- Latency (ms): `p50=707`, `p95=12001`, `p99=12019`, `avg=1593.10`, `max=12030`

## By Endpoint Scenario

### 1) `branch_monitor` (`/api/pos/monitor`)

- Requests: `157`
- Success: `157`
- Failed: `0`
- Error rate: `0%`
- Latency (ms): `p50=699`, `p95=1970`, `p99=2482`, `avg=805.54`, `max=2567`

### 2) `table_snapshot` (`/api/pos/tables`)

- Requests: `130`
- Success: `130`
- Failed: `0`
- Error rate: `0%`
- Latency (ms): `p50=676`, `p95=1919`, `p99=2118`, `avg=843.80`, `max=2269`

### 3) `tenant_monitor` (`/api/admin/pos/monitor`)

- Requests: `92`
- Success: `72`
- Failed: `20`
- Error rate: `21.74%`
- Latency (ms): `p50=1059`, `p95=12012`, `p99=12030`, `avg=3995.89`, `max=12030`
- Status counts: `200=72`, `timeout(0)=20`

## Bottleneck Notes

1. Main bottleneck is `/api/admin/pos/monitor` under concurrent load (timeouts at p95/p99).
2. `/api/pos/monitor` and `/api/pos/tables` remained stable with 0% errors.
3. The current admin monitor path still dominates tail latency because it fans out per branch with multiple count queries per branch.

## Next Optimization Candidate

1. Replace per-branch fan-out counts with pre-aggregated SQL/RPC view for monitor metrics.
2. Add short-term snapshot table/materialized view for tenant monitor panels.
3. Keep current cache+concurrency guard as first-layer protection.
