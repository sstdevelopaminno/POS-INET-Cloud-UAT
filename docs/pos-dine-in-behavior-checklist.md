# POS Dine-in Behavioral Checklist

Use this checklist before moving to Delivery mode development.

Date: `__________`  
Tester: `__________`  
Branch: `__________`  
Tenant/Store: `__________`

## Test Setup

- Open shift is active.
- At least 4 tables exist: 2 available, 1 occupied/ordering, 1 pending_payment.
- At least 3 products exist in menu.
- Browser DevTools Network tab is open (for timing/failed request checks).

## A) Table Switch Performance

| ID | Scenario | Steps | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| TS-01 | Open table from list | Go `นั่งโต๊ะ` -> click available table | Enter table immediately, no UI freeze, bill opens |  |  |
| TS-02 | Re-open occupied table | Back to table browser -> click occupied table | Enter table quickly, existing bill context loads |  |  |
| TS-03 | Rapid switch stress | Click table A -> B -> A quickly (3-5 times) | No stuck loading state, final table context correct |  |  |
| TS-04 | Floor-plan click speed | Switch to `BOARD` and click table | Same behavior as list mode, no lag spike |  |  |
| TS-05 | Button responsiveness | While switching table, test `เลือกโต๊ะ/ย้ายโต๊ะ/พักบิล` | Buttons not deadlocked incorrectly |  |  |

## B) Draft Restore / Cart Persistence

| ID | Scenario | Steps | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| DR-01 | Draft remains on same table | Open table A -> add 2 items -> go table browser -> re-open table A | Cart items still present on table A |  |  |
| DR-02 | Draft isolated per table | On table A add item X, on table B add item Y | Re-open each table and see only its own cart/items |  |  |
| DR-03 | Home mode isolation | With active dine-in table/cart, switch to `กลับบ้าน` | Home cart must not show dine-in table cart |  |  |
| DR-04 | Return from home to dine-in | Switch back to `นั่งโต๊ะ` and open original table | Original table items still correct |  |  |
| DR-05 | Refresh persistence | On active table with items, refresh page then open same table | Items restored correctly for that table |  |  |

## C) Move Table Reliability

| ID | Scenario | Steps | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| MV-01 | Move open table (no checkout yet) | Open table A (with/without items) -> `ย้ายโต๊ะ` -> choose table B -> confirm | Move success, no timeout error |  |  |
| MV-02 | Cart follows after move | After move A->B, open table B | Items and total move to B correctly |  |  |
| MV-03 | Source table cleared | After move A->B, check table A | A has no active bill/cart leftovers |  |  |
| MV-04 | Re-open moved table | Open table B again after leaving browser | Same bill/order/cart still present |  |  |
| MV-05 | Invalid target protection | Try moving to non-available table (if possible) | Action blocked with correct error message |  |  |
| MV-06 | Retry behavior | If request timeout occurs, retry move once | Should succeed or show stable actionable error |  |  |

## D) Cross-mode Isolation + Stability

| ID | Scenario | Steps | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| CM-01 | Dine-in -> Home -> Dine-in | Switch modes back and forth with active dine-in bill | No cart bleed across modes |  |  |
| CM-02 | Dine-in -> Delivery -> Dine-in | Repeat with delivery mode | No wrong bill/table context |  |  |
| CM-03 | Hold bill in dine-in | `พักบิล` on active table | Table panel clears correctly and restore works from hold list |  |  |
| CM-04 | Cancel pre-checkout cart | Add items before checkout, press `ยกเลิกบิล` | Cart clears according to mode logic, no stuck state |  |  |
| CM-05 | Cancel queued order | Create order then cancel with required flow | Cancel works and returns to table browser (dine-in) |  |  |
| CM-06 | Multi-table concurrent behavior | Keep table A active, open B and C in sequence | No data overwrite between tables |  |  |
| CM-07 | Branch/store isolation | Test same scenarios on another branch/store account | Data/bills do not cross tenant or branch |  |  |

## Quick Latency Targets (Operational)

| Metric | Target |
|---|---|
| Enter table with prefetched context | <= 300 ms perceived response |
| Enter table without cache | <= 1.5 s perceived response |
| Move table request complete | <= 3 s typical network |
| UI input freeze | 0 hard freeze / no dead click |

## Bug Report Template

| Field | Value |
|---|---|
| Case ID |  |
| Timestamp |  |
| Mode |  |
| Table ID/Code |  |
| Order No |  |
| Expected |  |
| Actual |  |
| Error Message |  |
| Network/API endpoint |  |
| Screenshot/Video |  |

## Exit Criteria (Ready to move forward)

- All `TS-*`, `DR-*`, `MV-*`, `CM-*` are Pass.
- No P0/P1 bug remains open.
- No repeated timeout in move-table flow under normal network.
- No reproducible cart-loss when reopening same table.

