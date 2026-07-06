> [!WARNING]
> ARCHIVED (2026-05-31): This document references legacy QR login flow and is kept for historical/audit context only.
> Active runtime flow: apps/backoffice-web `/login/store -> /login/branches|employee -> /login/devices`.
> See: `docs/ARCHIVE-QR-DECOMMISSION-2026-05-31.md`.
# AI Handoff - Login -> POS (Updated 2026-05-28)

เอกสารนี้ใช้สำหรับเปิดแชทใหม่แล้วทำงานต่อได้ทันที โดยไม่หลุดบริบท

## 1) สถานะล่าสุดของงาน
- Login + POS bridge ใช้งานได้ และยังคงหลัก multi-tenant เดิม
- แยก flow เป็น 2 ระบบชัดเจน:
  1. POS Login (ฝั่งเครื่องขาย): `http://localhost:3001/login/store`
  2. Mobile QR Scanner (ฝั่งมือถือ): `http://localhost:3001/login/qr-scan`
- เพิ่มปุ่มลงทะเบียนผู้ใช้งาน POS ที่ `/qr-scan/register`
- ขั้นตอนก่อนเข้า POS (ปัจจุบัน):
  1. `/login/store` (store code)
  2. `/login/branches?flow=multi` (ถ้ามีหลายสาขา)
  3. `/login/employee?flow=...` (ยืนยันด้วยรหัสพนักงาน หรือแสดง QR ให้มือถือสแกน)
  4. `/login/devices?flow=...`
  5. `/preview/pos` (POS gate + shift + sales)

## 2) สรุปโครงสร้าง Multi-tenant (ห้ามเปลี่ยนหลักการ)
- 1 เจ้าของร้าน = 1 `tenant`
- 1 เจ้าของร้านมีหลายสาขา = หลาย `branch` ภายใต้ tenant เดียว
- ทุกการเข้าระบบขายต้องอ้างอิง `tenant_id + branch_id + device_code + user_id`
- ห้ามให้ข้อมูลข้าม tenant หรือข้าม branch

## 3) อัปเดตสำคัญรอบ 2026-05-28
- เพิ่ม route ใหม่:
  - `apps/qr-login-web/src/app/qr-scan/page.tsx`
  - `apps/qr-login-web/src/app/qr-scan/register/page.tsx`
- เพิ่ม API ใหม่:
  - `apps/qr-login-web/src/app/api/auth/employee/verify-name/route.ts`
- เพิ่ม helper resolve ผู้ใช้ด้วยชื่อ:
  - `apps/qr-login-web/src/lib/server/pre-entry-auth.ts`
  - รองรับกรณีชื่อซ้ำในสาขา (`employee_name_ambiguous`)
- ปรับ flow forwarding จากหน้าสาขา -> หน้ายืนยันผู้ใช้ให้พก `employee_name` ได้:
  - `apps/qr-login-web/src/app/login/branches/page.tsx`
- ปรับหน้า employee ให้มีแท็บยืนยันด้วยชื่อ:
  - `apps/qr-login-web/src/app/login/employee/page.tsx`
- ปรับ root/PWA:
  - `apps/qr-login-web/src/app/page.tsx` -> redirect `/login/store`
  - `apps/qr-login-web/src/app/login/page.tsx` -> redirect `/login/store`
  - `apps/qr-login-web/src/app/manifest.ts` -> `start_url: /login/store`
- ปรับ UI ตาม feedback ล่าสุด:
  - หน้า `/qr-scan` เอาเลขหัวข้อ `1)`, `2)` ออก
  - หน้า `/qr-scan` และ `/login/store` ใช้ปุ่มติดตั้งแอปแบบปุ่มอย่างเดียว (ไม่มีข้อความแนะนำยาว)
  - ไฟล์หลัก: `apps/qr-login-web/src/components/pwa/mobile-install-guide.tsx`
- เพิ่มระบบควบคุมแจ้งเตือน/ล็อกเมนู POS จาก backend:
  - API: `GET /api/pos/system/notice`
  - ไฟล์: `apps/backoffice-web/src/app/api/pos/system/notice/route.ts`
  - รองรับ 4 โหมด:
    - `billing_lock` ล็อกทั้งระบบ + popup ชำระค่าบริการ (+ QR ได้เมื่อ backend ส่ง `payment_qr_url`)
    - `incident_lock` ล็อกทั้งระบบ + popup แจ้งเหตุขัดข้อง
    - `minor_maintenance` แสดงแถบเตือนด้านบนอย่างเดียว
    - `major_maintenance` ล็อกทั้งระบบ + popup + แถบเวลา maintenance
  - source config: `tenant_subscription_contracts.metadata.pos_runtime_notice`
- เพิ่ม layer ฝั่ง UI สำหรับ popup/banner กลางระบบ:
  - `apps/backoffice-web/src/components/pos/pos-runtime-notice-layer.tsx`
  - ผูกใน `apps/backoffice-web/src/app/preview/pos/layout.tsx`
- ปรับเมนู POS ตาม role:
  - `staff` เห็นเฉพาะ: หน้าขาย, รายการขาย, สรุปยอดขาย, ใบเสร็จย้อนหลัง, ผู้ใช้งาน
  - `manager/owner` เห็นเมนูทั้งหมด
  - ไฟล์: `apps/backoffice-web/src/components/pos-preview/pos-staff-menu.tsx`, `apps/backoffice-web/src/components/pos-preview/pos-shell-sidebar.tsx`

## 4) ไฟล์แกนหลักที่ AI ตัวใหม่ต้องอ่านก่อนแก้
1. `apps/qr-login-web/src/app/qr-scan/page.tsx`
2. `apps/qr-login-web/src/app/api/auth/employee/verify-name/route.ts`
3. `apps/qr-login-web/src/lib/server/pre-entry-auth.ts`
4. `apps/qr-login-web/src/app/login/branches/page.tsx`
5. `apps/qr-login-web/src/app/login/employee/page.tsx`
6. `apps/qr-login-web/src/app/login/devices/page.tsx`
7. `apps/qr-login-web/src/app/api/auth/devices/select/route.ts`
8. `apps/backoffice-web/src/components/pos/pos-entry-gate.tsx`
9. `apps/backoffice-web/src/app/api/pos/system/notice/route.ts`
10. `apps/backoffice-web/src/components/pos/pos-runtime-notice-layer.tsx`
11. `apps/backoffice-web/src/components/pos-preview/pos-staff-menu.tsx`
12. `apps/backoffice-web/src/components/pos-preview/pos-shell-sidebar.tsx`

## 5) กติกางานต่อ (Guardrails)
- ห้ามข้าม scope `tenant/branch` ระหว่าง login
- ห้ามตัดการตรวจ permission `pos.sales.access`
- ห้ามลบการตรวจ session ฝั่ง POS (`requirePosSession()`)
- ห้ามลบ cookie handoff/session (`pos_session_handoff`, `pos_session_id`)
- ถ้าชื่อผู้ใช้ซ้ำในสาขา ต้องบังคับ fallback ไปยืนยันด้วยรหัสหรือ QR

## 6) ปัญหาคงค้าง/งานต่อทันที
- ทำ UI มือถือ QR scan phase ต่อ (หน้าสแกนจริง + ภาพสลิป + policy)
- ทำ E2E รอบใหม่หลัง route `/qr-scan` และแท็บชื่อผู้ใช้
- อัปเดต smoke evidence JSON/ภาพหน้าจอให้ match flow ใหม่
- ผูกหลังบ้าน IT ให้เขียนค่า `tenant_subscription_contracts.metadata.pos_runtime_notice` (สำหรับ 4 popup mode)

## 7) วิธีทดสอบเร็ว
- POS Login start: `http://localhost:3001/login/store`
- Mobile Scanner page: `http://localhost:3001/login/qr-scan`
- POS Preview: `http://localhost:3000/preview/pos`
- ตรวจ session: `GET /api/pos/session/current`
- ตรวจสถานะ popup/ล็อกเมนู: `GET /api/pos/system/notice`

## 8) Prompt สำหรับเปิดแชทใหม่
"อ่านไฟล์ `docs/AI-HANDOFF-LOGIN-POS-2026-05-27.md` ก่อน แล้วทำต่อโดยคงการแยกระบบ POS Login (`/login/store -> /login/employee`) ออกจาก Mobile QR Scanner (`/login/qr-scan`) แบบ multi-tenant โดยห้ามลดความปลอดภัยของ session และ permission checks"

## 9) หมายเหตุสภาพแวดล้อม
- Node ในเครื่องอาจไม่ตรง `22.x` (เห็นคำเตือน engine mismatch ได้)
- ถ้า build fail เรื่อง `useSearchParams`, ให้ห่อหน้า client ด้วย `Suspense` ตาม pattern ใน `login/employee` และ `login/branches`

---
อัปเดตล่าสุด: 2026-05-28 (Asia/Bangkok)
