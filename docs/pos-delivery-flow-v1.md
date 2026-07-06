# POS Delivery Flow v1

## 1) Text State Diagram

`delivery:create_order`
- Entry: user switches to `Delivery` quick mode
- Exit to `delivery:edit_order`: checkout creates a queued delivery order
- Exit to `delivery:cancelled`: queued order cancelled with manager PIN
- Exit to `delivery:pending_dispatch`: submit is queued offline

`delivery:edit_order`
- Entry: there is an active queued delivery order
- Exit to `delivery:confirm_payment`: user opens payment review
- Exit to `delivery:cancelled`: cancel queued order with manager PIN
- Exit to `delivery:pending_dispatch`: update submit queued offline

`delivery:confirm_payment`
- Entry: payment review modal is open (cash/transfer path)
- Exit to `delivery:completed`: payment success
- Exit to `delivery:edit_order`: close review without payment
- Exit to `delivery:cancelled`: cancel from review with manager PIN

`delivery:pending_dispatch`
- Entry: delivery submit/update is staged in pending queue
- Exit to `delivery:edit_order`: pending replay succeeds and queued order exists
- Exit to `delivery:create_order`: pending replay succeeds with no active draft

`delivery:completed`
- Entry: payment completed
- Exit to `delivery:create_order`: user starts a new delivery draft

`delivery:cancelled`
- Entry: cancellation success
- Exit to `delivery:create_order`: user starts a new delivery draft

## 2) Files touched in round 1

- `apps/backoffice-web/src/components/pos/pos-sales-module.tsx`
- `apps/backoffice-web/src/app/globals.css`

## 3) Delivery-only test checklist

- [ ] Switch to `Delivery` and confirm setup card appears instead of catalog
- [ ] Select delivery app, fill external order code, optional customer name/notes
- [ ] Click `Pick Menu Items`, add items, checkout -> review modal opens
- [ ] Complete cash payment -> receipt flow works and order closes
- [ ] Complete transfer payment -> slip verify flow still works
- [ ] Cancel queued delivery order via PIN -> state shows cancelled and draft resets
- [ ] Clear delivery draft when no active order -> metadata + cart are cleared
- [ ] Hold bill then restore -> delivery metadata is restored
- [ ] Offline submit in delivery -> pending dispatch state appears and replay can recover

## 4) Regression checklist (Home / Dine-in)

- [ ] Home takeaway create order + payment still works
- [ ] Dine-in table selection, open bill, switch table draft, and payment still work
- [ ] Dine-in move table still works
- [ ] Dine-in cancel bill PIN flow still works
- [ ] Held bill list for dine-in and takeaway still works
- [ ] Sidebar actions (`Hold`, `Cancel/Clear`, `Checkout`) still enable/disable correctly
