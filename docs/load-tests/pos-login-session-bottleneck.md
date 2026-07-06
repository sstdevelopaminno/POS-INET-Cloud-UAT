# POS Login Session Bottleneck Load Test

Last updated: 2026-05-27

## Goal

ทดสอบคอขวดของ flow ก่อนเข้า POS:

1. `store -> branch -> employee -> device -> session`
2. ความสามารถในการกันชน `device_in_use` / `session_scope_conflict` ภายใต้ concurrency สูง
3. ความถูกต้องของ scope (`tenant/branch`) หลังสร้าง session แล้ว

## Command

```bash
pnpm qa:login-bottleneck-load -- \
  --login-base http://localhost:3001 \
  --pos-base http://localhost:3000 \
  --store-code NDL-TH-001 \
  --employee-codes EMP-000101,EMP-000102,EMP-000103 \
  --device-codes POS-DEMO-01 \
  --seconds 30 \
  --concurrency 20 \
  --mode conflict \
  --out docs/load-tests/pos-login-session-bottleneck-report.json
```

## Modes

- `conflict`: ทุก worker ยิงเข้า device เดียวกัน (stress จุดคอขวด)
- `distributed`: สุ่ม device จากรายการ
- `round_robin`: กระจาย device แบบวนลูป

## Output

- JSON report: `docs/load-tests/pos-login-session-bottleneck-report.json`
- Metrics สำคัญ:
  - `bottleneck_indicators.device_in_use_conflicts`
  - `bottleneck_indicators.session_scope_conflicts`
  - `bottleneck_indicators.scope_mismatch_branch` (ต้องเป็น `0`)
  - `totals.flow_error_rate_pct`
  - `steps.device_select.error_codes`

## Pass Criteria (recommended)

สำหรับ `mode=conflict`:

- `scope_mismatch_branch = 0`
- ไม่มี `session_creation_failed` ที่ไม่ใช่ conflict ปกติ
- response หลักต้องอยู่ในกลุ่มคาดหวัง (`200/201` และ `409 device_in_use`)

สำหรับ `mode=distributed`:

- success rate สูงกว่า conflict mode อย่างมีนัยสำคัญ
- `scope_mismatch_branch = 0`
- `session_scope_conflict` ต่ำ
