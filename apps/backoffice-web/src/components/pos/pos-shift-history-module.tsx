"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveShiftCycle, slotLabel, slotWindowLabel } from "@/lib/pos-shift-schedule";

type Lang = "th" | "en";
type ModalKind = "open" | "close" | "active" | "receipt" | null;
type BusyState = "open" | "close" | "print" | "logout" | null;

const BRANCH_FILTER_STORAGE_KEY = "pos_shift_history_branch_filter_v1";
const POS_SKIP_ENTRY_GATE_SPLASH_KEY = "pos_skip_entry_gate_overlay_once_v1";
const MODAL_TRANSITION_MS = 180;

type SessionCurrentResponse = {
  data?: {
    shift: { id: string; status: string; opened_at: string; closed_at: string | null } | null;
    has_active_shift: boolean;
  } | null;
  error?: { code?: string; message?: string } | null;
};

type SessionShift = {
  id: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
} | null;

type ShiftHistoryResponse = {
  data?: {
    filters: {
      days: number;
      self_only: boolean;
      can_view_branch_wide: boolean;
      selected_branch_id: string | null;
      branch_options: Array<{ id: string; code: string | null; name: string | null }>;
    };
    summary: {
      shift_count: number;
      order_count: number;
      cancelled_order_count: number;
      sales_total: number;
      cash_total: number;
      transfer_total: number;
    };
    shifts: Array<{
      id: string;
      opened_by: string;
      branch_code: string | null;
      branch_name: string | null;
      opened_at: string;
      closed_at: string | null;
      opening_cash: number;
      expected_cash: number | null;
      actual_cash: number | null;
      status: string;
      metrics: {
        order_count: number;
        cancelled_order_count: number;
        sales_total: number;
        cash_total: number;
        transfer_total: number;
      };
      summary_cutoff_at: string | null;
    }>;
  } | null;
  error?: { code?: string; message?: string } | null;
};

type CloseShiftResponse = {
  data?: {
    shift_id: string;
    status: "closed";
    closed_at: string;
    summary_cutoff_at: string;
    summary: {
      order_count: number;
      cancelled_order_count: number;
      sales_total: number;
      cash_total: number;
      transfer_total: number;
    };
    receipt: {
      tenant_name: string;
      branch_name: string;
      branch_code: string | null;
      seller_name: string;
      opened_at: string;
      opening_cash: number;
      closing_cash: number;
      expected_cash: number;
      actual_cash: number;
    };
  } | null;
  error?: { code?: string; message?: string } | null;
};

type ShiftCloseReceiptData = NonNullable<CloseShiftResponse["data"]>;
type BluetoothPrintJobStatus = "pending" | "printing" | "printed" | "failed" | "retrying";
type BluetoothPrintJob = {
  id: string;
  status: BluetoothPrintJobStatus;
  last_error: string | null;
  printed_at: string | null;
};
type BluetoothReceiptPrintResponseBody = {
  data?: {
    ok?: boolean;
    code?: string;
    message?: string;
    action?: string;
    timestamp?: string;
    data?: {
      fallback_to_browser_print?: boolean;
      jobs?: BluetoothPrintJob[];
    };
  } | null;
  error?: { code?: string; message?: string } | null;
};

function formatMoney(value: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "th" ? "th-TH" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatDateTime(value: string, lang: Lang) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString(lang === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function toActionLabel(mode: "open" | "close", lang: Lang) {
  if (mode === "open") return lang === "th" ? "เปิดกะทันที" : "Open Shift Now";
  return lang === "th" ? "ปิดกะตอนนี้" : "Close Shift Now";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildShiftCloseReceiptHtml(args: {
  receipt: ShiftCloseReceiptData;
  lang: Lang;
  labels: {
    orders: string;
    cancelled: string;
    sales: string;
    cash: string;
    transfer: string;
    receiptOpenedAt: string;
    receiptClosedAt: string;
    receiptCutoffAt: string;
    receiptSeller: string;
    receiptClosingCash: string;
  };
}) {
  const { receipt, lang, labels } = args;
  const dt = (value: string) => escapeHtml(formatDateTime(value, lang));
  const money = (value: number) => escapeHtml(formatMoney(value, lang));
  const line = (left: string, right: string) =>
    `<p style="margin:0;display:flex;justify-content:space-between;gap:6px;"><span>${escapeHtml(left)}</span><strong>${right}</strong></p>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
@page{size:58mm auto;margin:2mm;}
html,body{width:58mm;margin:0;padding:0;color:#000;font:11px/1.35 Tahoma,'Noto Sans Thai','Segoe UI',sans-serif;}
main{width:54mm;margin:0 auto;padding:0.8mm 0;}
h1,p{margin:0;}
.head{text-align:center;display:grid;gap:0.8mm}
.divider{border-top:1px dashed #000;margin:1.3mm 0}
.meta{display:grid;gap:0.7mm}
.summary{display:grid;gap:0.7mm}
.brand{padding-top:0.6mm;margin-top:0.6mm;border-top:1px solid #000;font-weight:900;text-align:center}
</style></head>
<body><main>
  <header class="head">
    <h1>${escapeHtml(receipt.receipt.tenant_name)}</h1>
    <p>${escapeHtml(receipt.receipt.branch_name)}</p>
  </header>
  <div class="divider"></div>
  <section class="meta">
    ${line(labels.receiptSeller, escapeHtml(receipt.receipt.seller_name))}
    ${line(labels.receiptOpenedAt, dt(receipt.receipt.opened_at))}
    ${line(labels.receiptClosedAt, dt(receipt.closed_at))}
    ${line(labels.receiptCutoffAt, dt(receipt.summary_cutoff_at))}
  </section>
  <div class="divider"></div>
  <section class="summary">
    ${line(labels.orders, String(receipt.summary.order_count))}
    ${line(labels.cancelled, String(receipt.summary.cancelled_order_count))}
    ${line(labels.sales, money(receipt.summary.sales_total))}
    ${line(labels.cash, money(receipt.summary.cash_total))}
    ${line(labels.transfer, money(receipt.summary.transfer_total))}
    ${line(labels.receiptClosingCash, money(receipt.receipt.closing_cash))}
  </section>
  <p class="brand">SST iPOS</p>
</main></body></html>`;
}

export function PosShiftHistoryModule({ lang }: { lang: Lang }) {
  const [days, setDays] = useState(30);
  const [branchFilter, setBranchFilter] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    const stored = window.sessionStorage.getItem(BRANCH_FILTER_STORAGE_KEY);
    return stored && stored.trim() ? stored : "all";
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [sessionShift, setSessionShift] = useState<SessionShift>(null);
  const [payload, setPayload] = useState<ShiftHistoryResponse["data"]>(null);
  const [closeReceipt, setCloseReceipt] = useState<ShiftCloseReceiptData | null>(null);
  const [receiptPrintJobs, setReceiptPrintJobs] = useState<BluetoothPrintJob[]>([]);
  const [receiptPrinted, setReceiptPrinted] = useState(false);
  const [receiptPrintStatus, setReceiptPrintStatus] = useState<"idle" | "printing" | "printed" | "failed">("idle");
  const [receiptPrintError, setReceiptPrintError] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [modalMounted, setModalMounted] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const text = useMemo(
    () =>
      lang === "th"
        ? {
            title: "เปิด/ปิดกะย้อนหลัง",
            subtitle: "ดูประวัติกะ ยอดขาย ยอดเงินสด/โอน จำนวนบิล และจำนวนบิลยกเลิก",
            activeShift: "กะที่เปิดอยู่",
            noActiveShift: "ยังไม่มีกะที่เปิดอยู่",
            openingCash: "เงินตั้งต้น",
            closingCash: "เงินสดปลายกะ",
            period: "ช่วงเวลา",
            branchFilter: "สาขา",
            print: "พิมพ์รายงาน",
            reload: "รีเฟรช",
            shifts: "จำนวนกะ",
            orders: "จำนวนบิล",
            cancelled: "บิลยกเลิก",
            sales: "ยอดขายรวม",
            cash: "เงินสด",
            transfer: "โอน",
            openedAt: "เปิดกะ",
            closedAt: "ปิดกะ",
            shiftName: "ชื่อกะ",
            status: "สถานะ",
            opening: "เงินตั้งต้น",
            expected: "เงินคาดหวัง",
            actual: "เงินนับจริง",
            open: "เปิด",
            closed: "ปิด",
            noData: "ไม่พบข้อมูลกะในช่วงเวลาที่เลือก",
            invalidMoney: "กรุณากรอกจำนวนเงินให้ถูกต้อง",
            shiftOpened: "เปิดกะสำเร็จ กำลังพาไปหน้าขาย...",
            shiftClosed: "ปิดกะสำเร็จ",
            openingShiftTitle: "กำลังเปิดกะ",
            openingShiftDesc: "ระบบกำลังบันทึกเงินตั้งต้นและเตรียมพาไปหน้าขาย...",
            popupTitleOpen: "ยืนยันเปิดกะ",
            popupTitleClose: "ยืนยันปิดกะ",
            popupTitleActive: "รายละเอียดกะที่เปิดอยู่",
            popupTitleReceipt: "ใบสรุปปิดกะ (58mm)",
            popupDescOpen: "กรอกเงินตั้งต้นก่อนเปิดกะ",
            popupDescClose: "กรอกเงินสดปลายกะก่อนปิดกะ",
            popupDescActive: "ตรวจสอบสถานะกะปัจจุบันก่อนดำเนินการ",
            popupDescReceipt: "ต้องพิมพ์ผ่านเครื่อง Bluetooth สำเร็จก่อน จึงจะไปหน้าเลือกสาขาได้",
            confirm: "ยืนยัน",
            cancel: "ยกเลิก",
            close: "ปิด",
            allBranches: "ทุกสาขา",
            finishAndExit: "เสร็จสิ้นและไปเลือกสาขา",
            printing: "กำลังพิมพ์...",
            printReceipt: "พิมพ์ใบสรุปผ่าน Bluetooth",
            printRequiredHint: "ต้องมีสถานะพิมพ์ Bluetooth สำเร็จก่อน จึงจะไปหน้าเลือกสาขาได้",
            printSuccessHint: "พิมพ์ Bluetooth สำเร็จแล้ว สามารถออกไปหน้าเลือกสาขาได้",
            printPendingHint: "กำลังตรวจสอบสถานะพิมพ์จากเครื่องจริง...",
            printFailedHint: "ยังไม่พบผลพิมพ์สำเร็จจาก Bluetooth กรุณาลองพิมพ์อีกครั้ง",
            printJobStatus: "สถานะพิมพ์",
            receiptStore: "ร้าน",
            receiptBranch: "สาขา",
            receiptSeller: "ผู้ขาย",
            receiptOpenedAt: "เปิดกะ",
            receiptClosedAt: "ปิดกะ",
            receiptCutoffAt: "ตัดยอดถึง",
            receiptOpeningCash: "เงินตั้งต้น",
            receiptClosingCash: "เงินสดปลายกะ",
            receiptExpectedCash: "เงินคาดหวัง",
            receiptActualCash: "เงินนับจริง"
          }
        : {
            title: "Open/Close Shift History",
            subtitle: "Review shift history, sales, cash/transfer totals, bill volume, and cancellations.",
            activeShift: "Active Shift",
            noActiveShift: "No active shift",
            openingCash: "Opening cash",
            closingCash: "Closing cash",
            period: "Period",
            branchFilter: "Branch",
            print: "Print report",
            reload: "Reload",
            shifts: "Shifts",
            orders: "Bills",
            cancelled: "Cancelled",
            sales: "Sales",
            cash: "Cash",
            transfer: "Transfer",
            openedAt: "Opened At",
            closedAt: "Closed At",
            shiftName: "Shift",
            status: "Status",
            opening: "Opening",
            expected: "Expected",
            actual: "Actual",
            open: "Open",
            closed: "Closed",
            noData: "No shift data found for this period.",
            invalidMoney: "Please enter a valid amount.",
            shiftOpened: "Shift opened. Redirecting to sales...",
            shiftClosed: "Shift closed successfully.",
            openingShiftTitle: "Opening shift",
            openingShiftDesc: "Saving opening cash and preparing the sales screen...",
            popupTitleOpen: "Confirm Open Shift",
            popupTitleClose: "Confirm Close Shift",
            popupTitleActive: "Active Shift Details",
            popupTitleReceipt: "Close Shift Receipt (58mm)",
            popupDescOpen: "Enter opening cash before opening this shift.",
            popupDescClose: "Enter closing cash before closing this shift.",
            popupDescActive: "Review current active shift status.",
            popupDescReceipt: "Bluetooth printer must report success before branch-switch is allowed.",
            confirm: "Confirm",
            cancel: "Cancel",
            close: "Close",
            allBranches: "All branches",
            finishAndExit: "Finish and go to branch selection",
            printing: "Printing...",
            printReceipt: "Print via Bluetooth",
            printRequiredHint: "Bluetooth print must be successful before leaving this page.",
            printSuccessHint: "Bluetooth print succeeded. You can continue to branch selection.",
            printPendingHint: "Checking live printer status...",
            printFailedHint: "No successful Bluetooth print yet. Please retry printing.",
            printJobStatus: "Print jobs",
            receiptStore: "Store",
            receiptBranch: "Branch",
            receiptSeller: "Seller",
            receiptOpenedAt: "Opened",
            receiptClosedAt: "Closed",
            receiptCutoffAt: "Cutoff",
            receiptOpeningCash: "Opening cash",
            receiptClosingCash: "Closing cash",
            receiptExpectedCash: "Expected cash",
            receiptActualCash: "Actual cash"
          },
    [lang]
  );

  const currentCycle = useMemo(() => {
    if (!sessionShift?.opened_at || sessionShift.status !== "open") return null;
    return resolveShiftCycle(sessionShift.opened_at);
  }, [sessionShift?.opened_at, sessionShift?.status]);

  const openModal = useCallback((kind: Exclude<ModalKind, null>) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setModalKind(kind);
    setModalMounted(true);
    window.requestAnimationFrame(() => {
      setModalVisible(true);
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setModalMounted(false);
      setModalKind(null);
      closeTimerRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionRes, historyRes] = await Promise.all([
        fetch("/api/pos/session/current", { cache: "no-store" }),
        fetch(`/api/pos/shifts/history?days=${days}&view=all&branch_id=${encodeURIComponent(branchFilter)}`, {
          cache: "no-store"
        })
      ]);
      const sessionBody = (await sessionRes.json().catch(() => null)) as SessionCurrentResponse | null;
      const historyBody = (await historyRes.json().catch(() => null)) as ShiftHistoryResponse | null;
      if (!sessionRes.ok || !sessionBody?.data) {
        throw new Error(sessionBody?.error?.message ?? "Unable to load shift session.");
      }
      if (!historyRes.ok || !historyBody?.data) {
        throw new Error(historyBody?.error?.message ?? "Unable to load shift history.");
      }

      const activeShift =
        sessionBody.data.has_active_shift && sessionBody.data.shift?.status === "open" ? sessionBody.data.shift : null;
      setSessionShift(activeShift);
      setPayload(historyBody.data);

      if (historyBody.data.filters.can_view_branch_wide) {
        const available = new Set((historyBody.data.filters.branch_options ?? []).map((branch) => branch.id));
        if (branchFilter !== "all" && !available.has(branchFilter)) {
          setBranchFilter("all");
        }
      } else if (branchFilter !== "all") {
        setBranchFilter("all");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }, [branchFilter, days]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(BRANCH_FILTER_STORAGE_KEY, branchFilter);
  }, [branchFilter]);

  useEffect(() => {
    if (!modalMounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modalMounted]);

  useEffect(() => {
    if (!modalMounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && modalKind !== "receipt") {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, closeModal, modalKind, modalMounted]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openShiftNow() {
    if (busy) return;
    const parsed = Number(openingCash.trim() || "0");
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(text.invalidMoney);
      return;
    }
    setBusy("open");
    setError(null);
    setMessage(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/pos/shifts/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opening_cash: parsed }),
        signal: controller.signal
      });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } | null } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Open shift failed.");
      }
      setMessage(text.shiftOpened);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(POS_SKIP_ENTRY_GATE_SPLASH_KEY, "1");
      }
      window.location.assign("/preview/pos");
    } catch (openError) {
      const isTimeout = openError instanceof DOMException && openError.name === "AbortError";
      if (isTimeout) {
        setMessage(lang === "th" ? "กำลังตรวจสอบว่ากะเปิดสำเร็จแล้วหรือไม่..." : "Checking whether the shift opened successfully...");
        try {
          const confirmController = new AbortController();
          const confirmTimeoutId = window.setTimeout(() => confirmController.abort(), 5000);
          const sessionRes = await fetch("/api/pos/session/current", {
            cache: "no-store",
            signal: confirmController.signal
          });
          window.clearTimeout(confirmTimeoutId);
          const sessionBody = (await sessionRes.json().catch(() => null)) as SessionCurrentResponse | null;
          if (sessionRes.ok && sessionBody?.data?.has_active_shift) {
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem(POS_SKIP_ENTRY_GATE_SPLASH_KEY, "1");
            }
            window.location.assign("/preview/pos");
            return;
          }
        } catch {
          // The first open request may still be finishing; retry remains protected by server idempotency.
        }
      }
      setError(isTimeout ? (lang === "th" ? "เปิดกะใช้เวลานานเกินไป กรุณาลองอีกครั้ง" : "Opening shift timed out. Please try again.") : openError instanceof Error ? openError.message : "Open shift failed.");
      setBusy(null);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function closeShiftNow() {
    if (busy || !sessionShift?.id) return;
    const parsed = Number(closingCash.trim() || "0");
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(text.invalidMoney);
      return;
    }
    setBusy("close");
    setError(null);
    setMessage(null);
    try {
      const closeRes = await fetch("/api/pos/shifts/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closing_cash: parsed })
      });
      const closeBody = (await closeRes.json().catch(() => null)) as CloseShiftResponse | null;
      if (!closeRes.ok || !closeBody?.data) {
        throw new Error(closeBody?.error?.message ?? "Close shift failed.");
      }
      setMessage(text.shiftClosed);
      setCloseReceipt(closeBody.data);
      setReceiptPrintJobs([]);
      setReceiptPrinted(false);
      setReceiptPrintStatus("idle");
      setReceiptPrintError(null);
      openModal("receipt");
      await load();
      setClosingCash("");
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Close shift failed.");
    } finally {
      setBusy(null);
    }
  }

  async function finishAndLogoutToBranchSelection() {
    if (busy) return;
    setBusy("logout");
    setError(null);
    try {
      const logoutRes = await fetch("/api/auth/session/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "switch_branch" })
      });
      const logoutBody = (await logoutRes.json().catch(() => null)) as {
        data?: { redirect_to?: string } | null;
        error?: { message?: string } | null;
      } | null;
      if (!logoutRes.ok) {
        throw new Error(logoutBody?.error?.message ?? "Logout failed.");
      }
      window.location.assign(logoutBody?.data?.redirect_to ?? "/login/branches?flow=multi");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Logout failed.");
      setBusy(null);
    }
  }

  async function printCloseReceipt() {
    if (!closeReceipt || busy === "logout" || busy === "print") return;

    setBusy("print");
    setReceiptPrintError(null);
    setReceiptPrinted(false);
    setReceiptPrintStatus("printing");
    setReceiptPrintJobs([]);

    try {
      const receiptHtml = buildShiftCloseReceiptHtml({
        receipt: closeReceipt,
        lang,
        labels: {
          orders: text.orders,
          cancelled: text.cancelled,
          sales: text.sales,
          cash: text.cash,
          transfer: text.transfer,
          receiptOpenedAt: text.receiptOpenedAt,
          receiptClosedAt: text.receiptClosedAt,
          receiptCutoffAt: text.receiptCutoffAt,
          receiptSeller: text.receiptSeller,
          receiptClosingCash: text.receiptClosingCash
        }
      });

      const response = await fetch("/api/pos/receipts/bluetooth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: null,
          order_no: `SHIFT-CLOSE-${closeReceipt.shift_id.slice(0, 8)}`,
          receipt_html: receiptHtml
        })
      });
      const body = (await response.json().catch(() => null)) as BluetoothReceiptPrintResponseBody | null;
      const envelope = body?.data ?? null;
      const jobs = Array.isArray(envelope?.data?.jobs) ? envelope.data.jobs : [];
      setReceiptPrintJobs(jobs);

      const printedCount = jobs.filter((job) => job.status === "printed").length;
      const failedCount = jobs.filter((job) => job.status === "failed").length;
      const unsettledCount = jobs.filter((job) => job.status === "pending" || job.status === "printing" || job.status === "retrying").length;
      const isSuccess = response.ok && !body?.error && envelope?.ok === true && printedCount > 0 && failedCount === 0 && unsettledCount === 0;

      if (isSuccess) {
        setReceiptPrinted(true);
        setReceiptPrintStatus("printed");
        return;
      }

      const noPrinterCode = envelope?.code === "bluetooth_printer_not_configured";
      const messageFromApi =
        body?.error?.message ??
        envelope?.message ??
        (noPrinterCode
          ? lang === "th"
            ? "ยังไม่ได้ตั้งค่าเครื่องพิมพ์ Bluetooth สำหรับใบเสร็จ"
            : "Bluetooth receipt printer is not configured."
          : lang === "th"
            ? "พิมพ์ Bluetooth ไม่สำเร็จ"
            : "Bluetooth print failed.");
      setReceiptPrintStatus("failed");
      setReceiptPrintError(messageFromApi);
    } catch (printError) {
      setReceiptPrintStatus("failed");
      setReceiptPrintError(
        printError instanceof Error
          ? printError.message
          : lang === "th"
            ? "พิมพ์ Bluetooth ไม่สำเร็จ"
            : "Bluetooth print failed."
      );
    } finally {
      setBusy((current) => (current === "print" ? null : current));
    }
  }

  const printStatusHint =
    receiptPrintStatus === "printed"
      ? text.printSuccessHint
      : receiptPrintStatus === "printing"
        ? text.printPendingHint
        : receiptPrintStatus === "failed"
          ? text.printFailedHint
          : text.printRequiredHint;

  return (
    <section className="min-h-0 w-full overflow-auto pb-6 pr-2">
      <div className="mx-auto w-full max-w-[1240px] space-y-4">
        <header className="rounded-3xl border border-slate-200 bg-[linear-gradient(140deg,#ffffff_0%,#f5f8ff_55%,#eef4ff_100%)] p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-slate-900">{text.title}</h1>
              <p className="mt-1 text-sm text-slate-600">{text.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openModal("active")}
                className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                {text.activeShift}
              </button>
              <button
                type="button"
                onClick={() => openModal("open")}
                disabled={Boolean(sessionShift)}
                className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {toActionLabel("open", lang)}
              </button>
              <button
                type="button"
                onClick={() => openModal("close")}
                disabled={!sessionShift}
                className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {toActionLabel("close", lang)}
              </button>
            </div>
          </div>
        </header>

        {message ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{text.period}</span>
                <select
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                  className="h-10 rounded-xl border border-slate-300 px-3"
                >
                  <option value={7}>7</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                </select>
              </label>

              {payload?.filters.can_view_branch_wide ? (
                <label className="grid gap-1">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{text.branchFilter}</span>
                  <select
                    value={branchFilter}
                    onChange={(event) => setBranchFilter(event.target.value)}
                    className="h-10 rounded-xl border border-slate-300 px-3"
                  >
                    <option value="all">{text.allBranches}</option>
                    {(payload.filters.branch_options ?? []).map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name ?? branch.code ?? branch.id}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                {text.print}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                {text.reload}
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{text.shifts}</p>
              <p className="text-lg font-black">{payload?.summary.shift_count ?? 0}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{text.orders}</p>
              <p className="text-lg font-black">{payload?.summary.order_count ?? 0}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{text.cancelled}</p>
              <p className="text-lg font-black">{payload?.summary.cancelled_order_count ?? 0}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{text.sales}</p>
              <p className="text-lg font-black">{formatMoney(payload?.summary.sales_total ?? 0, lang)}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{text.cash}</p>
              <p className="text-lg font-black">{formatMoney(payload?.summary.cash_total ?? 0, lang)}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{text.transfer}</p>
              <p className="text-lg font-black">{formatMoney(payload?.summary.transfer_total ?? 0, lang)}</p>
            </article>
          </div>

          {loading ? <p className="mt-4 text-sm text-slate-500">Loading...</p> : null}
          {!loading && payload && payload.shifts.length === 0 ? <p className="mt-4 text-sm text-slate-500">{text.noData}</p> : null}

          {!loading && payload && payload.shifts.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-3 py-3">{text.shiftName}</th>
                    {payload.filters.can_view_branch_wide ? <th className="px-3 py-3">{text.branchFilter}</th> : null}
                    <th className="px-3 py-3">{text.openedAt}</th>
                    <th className="px-3 py-3">{text.closedAt}</th>
                    <th className="px-3 py-3">{text.status}</th>
                    <th className="px-3 py-3 text-right">{text.orders}</th>
                    <th className="px-3 py-3 text-right">{text.cancelled}</th>
                    <th className="px-3 py-3 text-right">{text.sales}</th>
                    <th className="px-3 py-3 text-right">{text.cash}</th>
                    <th className="px-3 py-3 text-right">{text.transfer}</th>
                    <th className="px-3 py-3 text-right">{text.opening}</th>
                    <th className="px-3 py-3 text-right">{text.expected}</th>
                    <th className="px-3 py-3 text-right">{text.actual}</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.shifts.map((shift) => {
                    const cycle = resolveShiftCycle(shift.opened_at);
                    return (
                      <tr key={shift.id} className="border-t border-slate-200">
                        <td className="px-3 py-3 font-semibold text-slate-700">{cycle ? slotLabel(cycle.slot, lang) : "-"}</td>
                        {payload.filters.can_view_branch_wide ? (
                          <td className="px-3 py-3 text-slate-600">{shift.branch_name ?? shift.branch_code ?? "-"}</td>
                        ) : null}
                        <td className="px-3 py-3 text-slate-600">{formatDateTime(shift.opened_at, lang)}</td>
                        <td className="px-3 py-3 text-slate-600">{shift.closed_at ? formatDateTime(shift.closed_at, lang) : "-"}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              shift.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {shift.status === "open" ? text.open : text.closed}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">{shift.metrics.order_count}</td>
                        <td className="px-3 py-3 text-right">{shift.metrics.cancelled_order_count}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(shift.metrics.sales_total, lang)}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(shift.metrics.cash_total, lang)}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(shift.metrics.transfer_total, lang)}</td>
                        <td className="px-3 py-3 text-right">{formatMoney(shift.opening_cash, lang)}</td>
                        <td className="px-3 py-3 text-right">{shift.expected_cash === null ? "-" : formatMoney(shift.expected_cash, lang)}</td>
                        <td className="px-3 py-3 text-right">{shift.actual_cash === null ? "-" : formatMoney(shift.actual_cash, lang)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>

      {modalMounted && modalKind ? (
        <div className="fixed inset-0 z-[110] grid place-items-center p-4">
          <div
            className={`absolute inset-0 bg-slate-950/55 transition-opacity duration-200 ${
              modalVisible ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => {
              if (!busy && modalKind !== "receipt") closeModal();
            }}
          />
          <section
            className={`relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl transition-all duration-200 ${
              modalVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-extrabold text-slate-900">
              {busy === "open"
                ? text.openingShiftTitle
                : modalKind === "open"
                ? text.popupTitleOpen
                : modalKind === "close"
                  ? text.popupTitleClose
                  : modalKind === "active"
                    ? text.popupTitleActive
                    : text.popupTitleReceipt}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {busy === "open"
                ? text.openingShiftDesc
                : modalKind === "open"
                ? text.popupDescOpen
                : modalKind === "close"
                  ? text.popupDescClose
                  : modalKind === "active"
                    ? text.popupDescActive
                    : text.popupDescReceipt}
            </p>

            {busy === "open" ? (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-800">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" aria-hidden />
                <span>{text.openingShiftDesc}</span>
              </div>
            ) : null}

            {modalKind === "active" ? (
              <>
                {!sessionShift ? (
                  <p className="mt-4 text-sm text-slate-600">{text.noActiveShift}</p>
                ) : (
                  <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <p>
                      {text.shiftName}: <strong>{currentCycle ? slotLabel(currentCycle.slot, lang) : "-"}</strong>
                    </p>
                    {currentCycle ? (
                      <p>
                        {text.period}: <strong>{slotWindowLabel(currentCycle.slot, lang)}</strong>
                      </p>
                    ) : null}
                    <p>
                      {text.openedAt}: <strong>{formatDateTime(sessionShift.opened_at, lang)}</strong>
                    </p>
                    <p>
                      {text.status}: <strong>{sessionShift.status === "open" ? text.open : text.closed}</strong>
                    </p>
                  </div>
                )}
              </>
            ) : null}

            {(modalKind === "open" || modalKind === "close") ? (
              <label className="mt-4 grid gap-1 text-sm font-semibold text-slate-700">
                {modalKind === "open" ? text.openingCash : text.closingCash}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={modalKind === "open" ? openingCash : closingCash}
                  disabled={Boolean(busy)}
                  onChange={(event) => {
                    if (modalKind === "open") setOpeningCash(event.target.value);
                    if (modalKind === "close") setClosingCash(event.target.value);
                    if (error) setError(null);
                  }}
                  className="h-11 rounded-xl border border-slate-300 px-3 disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="0.00"
                />
              </label>
            ) : null}

            {modalKind === "receipt" && closeReceipt ? (
              <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p>
                  {text.receiptStore}: <strong>{closeReceipt.receipt.tenant_name}</strong>
                </p>
                <p>
                  {text.receiptBranch}: <strong>{closeReceipt.receipt.branch_name}</strong>
                </p>
                <p>
                  {text.receiptSeller}: <strong>{closeReceipt.receipt.seller_name}</strong>
                </p>
                <p>
                  {text.receiptOpenedAt}: <strong>{formatDateTime(closeReceipt.receipt.opened_at, lang)}</strong>
                </p>
                <p>
                  {text.receiptClosedAt}: <strong>{formatDateTime(closeReceipt.closed_at, lang)}</strong>
                </p>
                <p>
                  {text.receiptCutoffAt}: <strong>{formatDateTime(closeReceipt.summary_cutoff_at, lang)}</strong>
                </p>
                <hr className="border-slate-200" />
                <p>
                  {text.orders}: <strong>{closeReceipt.summary.order_count}</strong>
                </p>
                <p>
                  {text.cancelled}: <strong>{closeReceipt.summary.cancelled_order_count}</strong>
                </p>
                <p>
                  {text.sales}: <strong>{formatMoney(closeReceipt.summary.sales_total, lang)}</strong>
                </p>
                <p>
                  {text.cash}: <strong>{formatMoney(closeReceipt.summary.cash_total, lang)}</strong>
                </p>
                <p>
                  {text.transfer}: <strong>{formatMoney(closeReceipt.summary.transfer_total, lang)}</strong>
                </p>
                <hr className="border-slate-200" />
                <p>
                  {text.receiptOpeningCash}: <strong>{formatMoney(closeReceipt.receipt.opening_cash, lang)}</strong>
                </p>
                <p>
                  {text.receiptClosingCash}: <strong>{formatMoney(closeReceipt.receipt.closing_cash, lang)}</strong>
                </p>
                <p>
                  {text.receiptExpectedCash}: <strong>{formatMoney(closeReceipt.receipt.expected_cash, lang)}</strong>
                </p>
                <p>
                  {text.receiptActualCash}: <strong>{formatMoney(closeReceipt.receipt.actual_cash, lang)}</strong>
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              {modalKind === "receipt" ? (
                <>
                  {receiptPrintError ? (
                    <p className="mr-auto rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                      {receiptPrintError}
                    </p>
                  ) : (
                    <p
                      className={`mr-auto text-xs font-semibold ${
                        receiptPrintStatus === "printed"
                          ? "text-emerald-700"
                          : receiptPrintStatus === "failed"
                            ? "text-rose-700"
                            : "text-slate-500"
                      }`}
                    >
                      {printStatusHint}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void printCloseReceipt()}
                    disabled={busy === "logout" || busy === "print"}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-60"
                  >
                    {busy === "print" ? text.printing : text.printReceipt}
                  </button>
                  <button
                    type="button"
                    onClick={() => void finishAndLogoutToBranchSelection()}
                    disabled={busy === "logout" || busy === "print" || !receiptPrinted}
                    className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {busy === "logout" ? "..." : text.finishAndExit}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => closeModal()}
                    disabled={Boolean(busy)}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-60"
                  >
                    {modalKind === "active" ? text.close : text.cancel}
                  </button>
                  {modalKind !== "active" ? (
                    <button
                      type="button"
                      onClick={() => void (modalKind === "open" ? openShiftNow() : closeShiftNow())}
                      disabled={Boolean(busy)}
                      className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {busy === "open" ? text.openingShiftTitle : busy === "close" ? "..." : text.confirm}
                    </button>
                  ) : null}
                </>
              )}
            </div>

            {modalKind === "receipt" && receiptPrintJobs.length > 0 ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{text.printJobStatus}</p>
                <ul className="grid gap-1 text-xs text-slate-700">
                  {receiptPrintJobs.map((job) => (
                    <li key={job.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{job.id.slice(0, 8)}</span>
                      <span className="font-semibold">{job.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {closeReceipt ? (
        <section className="posui-print-receipt-root" aria-hidden="true">
          <article className="posui-print-receipt58">
            <header className="posui-print-receipt58__head">
              <h1>{closeReceipt.receipt.tenant_name}</h1>
              <p>{closeReceipt.receipt.branch_name}</p>
            </header>
            <div className="posui-print-receipt58__divider" />
            <dl className="posui-print-receipt58__meta">
              <div>
                <dt>{text.receiptSeller}</dt>
                <dd>{closeReceipt.receipt.seller_name}</dd>
              </div>
              <div>
                <dt>{text.receiptOpenedAt}</dt>
                <dd>{formatDateTime(closeReceipt.receipt.opened_at, lang)}</dd>
              </div>
              <div>
                <dt>{text.receiptClosedAt}</dt>
                <dd>{formatDateTime(closeReceipt.closed_at, lang)}</dd>
              </div>
              <div>
                <dt>{text.receiptCutoffAt}</dt>
                <dd>{formatDateTime(closeReceipt.summary_cutoff_at, lang)}</dd>
              </div>
            </dl>
            <div className="posui-print-receipt58__divider" />
            <div className="posui-print-receipt58__summary">
              <p className="is-heading">
                <span>{text.orders}</span>
                <strong>{closeReceipt.summary.order_count}</strong>
              </p>
              <p className="is-muted">
                <span>{text.cancelled}</span>
                <strong>{closeReceipt.summary.cancelled_order_count}</strong>
              </p>
              <p className="is-aux">
                <span>{text.sales}</span>
                <strong>{formatMoney(closeReceipt.summary.sales_total, lang)}</strong>
              </p>
              <p className="is-aux">
                <span>{text.cash}</span>
                <strong>{formatMoney(closeReceipt.summary.cash_total, lang)}</strong>
              </p>
              <p className="is-aux">
                <span>{text.transfer}</span>
                <strong>{formatMoney(closeReceipt.summary.transfer_total, lang)}</strong>
              </p>
              <p className="is-due">
                <span>{text.receiptClosingCash}</span>
                <strong>{formatMoney(closeReceipt.receipt.closing_cash, lang)}</strong>
              </p>
              <p className="is-aux">
                <span>{text.receiptOpeningCash}</span>
                <strong>{formatMoney(closeReceipt.receipt.opening_cash, lang)}</strong>
              </p>
              <p className="is-aux">
                <span>{text.receiptExpectedCash}</span>
                <strong>{formatMoney(closeReceipt.receipt.expected_cash, lang)}</strong>
              </p>
              <p className="is-aux">
                <span>{text.receiptActualCash}</span>
                <strong>{formatMoney(closeReceipt.receipt.actual_cash, lang)}</strong>
              </p>
            </div>
            <div className="posui-print-receipt58__divider" />
            <p className="posui-print-receipt58__footer">SST iPOS</p>
          </article>
        </section>
      ) : null}
    </section>
  );
}
