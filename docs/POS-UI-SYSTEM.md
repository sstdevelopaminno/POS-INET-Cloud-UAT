# POS UI System (Web/PWA, Android-ready, iOS-ready)

## 1) Layout principles
- Use one shared POS composition model across clients: `category navigation + product grid + cart/payment`.
- Keep sales behavior and APIs independent from UI layout so Web/PWA, Android, iOS can share the same interaction structure.
- Use tablet-first layout scaling down to mobile and scaling up to desktop.
- Keep payment actions always reachable via sticky action zone.

## 2) Responsive breakpoints
- `>= 1367px`: desktop large landscape, 3-column shell.
- `1181px - 1366px`: laptop/tablet landscape wide, compact 3-column shell.
- `1025px - 1180px`: tablet landscape, top category rail + right cart.
- `<= 1024px`: portrait/tablet/mobile mode, cart switches to drawer + sticky summary bar.
- `<= 900px`: mobile-focused spacing and 2-column product grid.
- `<= 560px`: narrow mobile, single-column product grid.

## 3) Tablet-first design rules
- Start with touch interactions, then densify only on larger landscape.
- Keep category navigation horizontally scrollable in portrait/tablet.
- Keep cart visible in landscape tablet; drawer in portrait tablet/mobile.

## 4) Touch target sizes
- All key actions (`button`, chips, qty controls, inputs/selects) minimum `44px`.
- Qty controls and sticky payment CTA keep strong contrast and large hit areas.

## 5) Cart behavior
- Desktop/laptop/tablet landscape: cart fixed right panel.
- Tablet portrait/mobile: cart hidden as side panel and shown as bottom drawer.
- Sticky bottom summary button opens cart drawer on smaller viewports.

## 6) Product grid behavior
- Desktop: 4 columns.
- Laptop/tablet landscape: 3 columns.
- Mobile portrait/landscape: 2 columns.
- Very narrow mobile: 1 column.

## 7) Modal behavior
- Manager approval modal uses viewport-safe width and max-height (`<= 90vh`) with scroll.
- Dialog remains inside viewport and safe-area aware on iOS.

## 8) Payment panel behavior
- Payment controls are at bottom of cart panel.
- Action group is sticky at bottom to keep checkout/retry reachable.
- Discount/GP/note remain in panel and do not require navigation away from cart.

## 9) iOS safe-area rules
- Shell padding includes `env(safe-area-inset-top/right/bottom/left)`.
- Sticky action/drawer areas include bottom safe-area inset.
- Drawer and modal use viewport-bounded heights to prevent clipping.

## 10) Portrait/landscape layout rules
- Landscape: prioritize simultaneous visibility (category + product + cart).
- Portrait: prioritize browsing + fast cart access via summary bar and drawer.
- Orientation is detected in `PosShell` and exposed via `data-orientation`.

## 11) Android/iOS/Web differences
- Web/PWA: full responsive shell + drawer behavior.
- Android app (future): can map shared layout and keep native print/device integration.
- iOS app (future): same layout model, with stricter safe-area and keyboard overlap handling.
- iOS Safari/PWA: keep fixed controls safe-area aware and avoid edge-clipped modals.

## 12) Shared components used
- `PosShell`
- `PosCategoryNav`
- `PosProductGrid`
- `PosProductCard`
- `PosCartPanel`
- `PosCartDrawer`
- `PosPaymentPanel`
- `PosOrderTypeSelector`
- `PosManagerApprovalModal`

## 13) Current route coverage
- `/pos/sales`: migrated to shared `pos-ui` components while preserving existing sales logic.
- `/preview/pos`: refactored to shared `pos-ui` composition as demo/preview route.
