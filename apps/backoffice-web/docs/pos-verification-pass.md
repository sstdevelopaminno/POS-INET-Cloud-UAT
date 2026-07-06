# POS Verification Pass (Print / Delivery Send / Delivery Cancel / Table Move)

This runbook validates real click flows and captures trace logs from the POS screen.

## 1) Prerequisite

- Enable profiling in env:
  - `NEXT_PUBLIC_POS_RENDER_PROFILER=1`
- Open POS sales page in browser.
- Open browser DevTools Console.

## 2) Helper commands in Console

```js
// Clear previous traces
window.__posVerification?.clearTrace();

// Inspect current runtime state
window.__posVerification?.snapshot();

// Read all traces
window.__posVerification?.readTrace();

// Inspect generated 58mm receipt HTML
window.__posVerification?.getReceiptPrintHtml?.();
```

## 3) Flow A: Receipt Print (58mm)

1. Open a bill and complete payment until `ใบเสร็จ 58 mm` modal is shown.
2. Click `พิมพ์ใบเสร็จ`.
3. In print preview, verify:
   - receipt layout width is thermal-style (not full A4 content layout)
   - no extra browser header/footer
4. After closing print preview, run:

```js
window.__posVerification?.readTrace().filter((x) => String(x.action || "").startsWith("receipt.print"));
```

Expected:
- has `type: "start"` and `type: "end"`
- `status: "ok"` on end

## 4) Flow B: Pending Delivery Send

1. Open `บิลรอรับออเดอร์`.
2. Click `ส่ง` once, then try rapid repeated clicks.
3. Verify UI does not freeze and duplicate actions are blocked.
4. Run:

```js
window.__posVerification?.snapshot();
window.__posVerification?.readTrace().filter((x) => String(x.action || "").startsWith("delivery.pending.send"));
```

Expected:
- one logical queue execution per bill
- no burst of duplicate send traces for same bill at same time

## 5) Flow C: Pending Delivery Cancel

1. Open `บิลรอรับออเดอร์`.
2. Click `ยกเลิก` once, then rapid repeated clicks.
3. Verify bill is removed/updated correctly and UI remains responsive.
4. Run:

```js
window.__posVerification?.snapshot();
window.__posVerification?.readTrace().filter((x) => String(x.action || "").startsWith("delivery.pending.cancel"));
```

Expected:
- action finishes with `status: "ok"` or clear error trace
- no stuck lock (`delivery_action_lock_size` should return to 0)

## 6) Flow D: Table Move

1. In dine-in mode, open move table modal.
2. Select target table and submit move.
3. Verify cart/session follows target table and UI updates quickly.
4. Run:

```js
window.__posVerification?.snapshot();
window.__posVerification?.readTrace().filter((x) => String(x.action || "") === "table.move");
```

Expected:
- has start/end trace
- end status is `ok`

## 7) Quick failure triage

If any flow fails:

```js
const traces = window.__posVerification?.readTrace() || [];
console.table(traces.slice(-50));
window.__posVerification?.snapshot();
```

Capture:
- last 50 traces
- current snapshot
- exact user action and timestamp
