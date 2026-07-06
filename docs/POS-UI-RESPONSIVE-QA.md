# POS UI Responsive QA

## Scope
- Target page: `/preview/pos` (shared POS UI structure mirror for `/pos/sales`).
- Date: 2026-05-19
- Viewports required:
  - `1440x900`
  - `1366x768`
  - `1180x820`
  - `820x1180`
  - `1280x800`
  - `800x1280`
  - `390x844`
  - `844x390`

## Screenshot paths
- `docs/qa-screenshots/pos-ui-unified/desktop-1440x900.png`
- `docs/qa-screenshots/pos-ui-unified/laptop-1366x768.png`
- `docs/qa-screenshots/pos-ui-unified/ipad-landscape-1180x820.png`
- `docs/qa-screenshots/pos-ui-unified/ipad-portrait-820x1180.png`
- `docs/qa-screenshots/pos-ui-unified/android-tablet-landscape-1280x800.png`
- `docs/qa-screenshots/pos-ui-unified/android-tablet-portrait-800x1280.png`
- `docs/qa-screenshots/pos-ui-unified/mobile-portrait-390x844.png`
- `docs/qa-screenshots/pos-ui-unified/mobile-landscape-844x390.png`

## Checklist
- [x] Desktop/laptop keeps 3-zone visibility (category + products + cart).
- [x] Tablet landscape keeps right cart and sticky payment action zone.
- [x] Tablet portrait switches cart to drawer with bottom cart summary bar.
- [x] Mobile portrait uses top chips + product grid + full cart drawer.
- [x] Mobile landscape keeps actionability with summary bar and drawer.
- [x] Touch targets are designed for minimum 44px.
- [x] Safe-area insets applied to shell and sticky zones.
- [x] Horizontal overflow prevention added in shared shell/grid/cart wrappers.
- [x] Modal max-height and scroll behavior implemented for manager approval modal.

## Automation
- QA capture script: `scripts/pos-ui-responsive-qa.mjs`
- Report output path: `docs/qa-screenshots/pos-ui-unified/results.json`

## Result Summary (2026-05-19, rerun)
- `hasOverflow`: pass all 8 viewports (`overflowPx = 0`).
- `smallTargetCount`: pass all 8 viewports (`0` in every viewport).
- `modalIssues`: pass all 8 viewports (no modal clipping detected).

## Re-run command

```bash
node scripts/pos-ui-responsive-qa.mjs
```
