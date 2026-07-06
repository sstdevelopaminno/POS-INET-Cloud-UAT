"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveShiftCycle,
  resolveShiftGuardPhase,
  slotLabel,
  slotWindowLabel,
  type ShiftGuardPhase
} from "@/lib/pos-shift-schedule";

type Lang = "th" | "en";

type SessionResponse = {
  data?: {
    shift: { id: string; status: string; opened_at: string; closed_at: string | null } | null;
    has_active_shift: boolean;
  } | null;
  error?: { code?: string; message?: string } | null;
};

type ApiBody = {
  data?: unknown;
  error?: { message?: string } | null;
} | null;

const POS_SESSION_EVENT_NAME = "pos-session-current-updated";

function formatDateTime(value: string, lang: Lang) {
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return value;
  return d.toLocaleString(lang === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = (await response.json().catch(() => null)) as ApiBody;
    return { response, body };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function PosShiftCycleGuard({ lang }: { lang: Lang }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "continue" | "close" | "autoclose">(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ShiftGuardPhase>("on_time");
  const [shift, setShift] = useState<{ id: string; opened_at: string; status: string } | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const autoCloseRunRef = useRef<string | null>(null);
  const loadStateInFlightRef = useRef(false);

  const copy = useMemo(
    () =>
      lang === "th"
        ? {
            title: "แจ้งเตือนปิดกะ",
            subtitle: "รอบกะปัจจุบันสิ้นสุดแล้ว กรุณาเลือกการดำเนินการ",
            continueLabel: "ต่อกะ",
            closeLabel: "ปิดกะ",
            closeNowTitle: "ปิดกะตอนนี้",
            closeNowDesc: "กรอกเงินสดปลายกะเพื่อบันทึกและปิดรอบขาย",
            closingCash: "เงินสดปลายกะ",
            confirmClose: "ยืนยันปิดกะ",
            print: "พิมพ์รายงาน",
            cancel: "ยกเลิก",
            autoClosing: "ระบบกำลังปิดกะอัตโนมัติ",
            urgentHint: "เกินเวลาแล้ว กรุณาปิดกะทันที",
            logoutHint: "หลังปิดกะ ระบบจะพาไปหน้าเลือกสาขาอัตโนมัติ",
            closingProgress: "กำลังปิดกะและออกจากหน้าขาย...",
            continuingProgress: "กำลังต่อกะและเตรียมหน้าขาย...",
            requestTimeout: "ระบบใช้เวลานานเกินไป กรุณาลองอีกครั้ง",
            invalidClosingCash: "กรุณากรอกเงินสดปลายกะให้ถูกต้อง",
            unknownError: "ดำเนินการไม่สำเร็จ",
            opened: "เริ่มกะ",
            windowEnded: "ครบเวลา"
          }
        : {
            title: "Shift Close Reminder",
            subtitle: "Current shift window has ended. Please choose an action.",
            continueLabel: "Continue shift",
            closeLabel: "Close shift",
            closeNowTitle: "Close Shift",
            closeNowDesc: "Enter closing cash to save and close this shift.",
            closingCash: "Closing cash",
            confirmClose: "Confirm close",
            print: "Print report",
            cancel: "Cancel",
            autoClosing: "System is auto-closing this shift.",
            urgentHint: "Shift window has ended. Please close this shift now.",
            logoutHint: "After shift close, you will be redirected to branch selection.",
            closingProgress: "Closing shift and leaving sales screen...",
            continuingProgress: "Continuing shift and preparing sales screen...",
            requestTimeout: "Request took too long. Please try again.",
            invalidClosingCash: "Please enter a valid closing cash amount.",
            unknownError: "Unable to complete request.",
            opened: "Opened",
            windowEnded: "Window ended"
          },
    [lang]
  );

  const cycle = useMemo(() => (shift ? resolveShiftCycle(shift.opened_at) : null), [shift]);

  const applySessionState = useCallback((sessionData: SessionResponse["data"]) => {
    const activeShift = sessionData?.has_active_shift && sessionData.shift?.status === "open" ? sessionData.shift : null;
    if (!activeShift) {
      setShift(null);
      setPhase("on_time");
      setLoading(false);
      return;
    }
    setShift({
      id: activeShift.id,
      opened_at: activeShift.opened_at,
      status: activeShift.status
    });
    const nextCycle = resolveShiftCycle(activeShift.opened_at);
    setPhase(nextCycle ? resolveShiftGuardPhase(nextCycle) : "on_time");
    setLoading(false);
  }, []);

  const toErrorMessage = useCallback(
    (unknownError: unknown) => {
      if (unknownError instanceof Error && unknownError.message === "request_timeout") return copy.requestTimeout;
      return unknownError instanceof Error ? unknownError.message : copy.unknownError;
    },
    [copy.requestTimeout, copy.unknownError]
  );

  const loadState = useCallback(async () => {
    if (loadStateInFlightRef.current) return;
    loadStateInFlightRef.current = true;
    try {
      const { response, body } = await fetchJsonWithTimeout("/api/pos/session/current", { cache: "no-store" }, 8000);
      const sessionBody = body as SessionResponse | null;
      if (!response.ok || !sessionBody?.data) {
        setShift(null);
        setPhase("on_time");
        return;
      }
      applySessionState(sessionBody.data);
    } catch {
      if (phase !== "on_time") setError(copy.requestTimeout);
    } finally {
      loadStateInFlightRef.current = false;
      setLoading(false);
    }
  }, [applySessionState, copy.requestTimeout, phase]);

  useEffect(() => {
    const onSessionUpdated = (event: Event) => {
      applySessionState((event as CustomEvent<SessionResponse["data"]>).detail);
    };
    window.addEventListener(POS_SESSION_EVENT_NAME, onSessionUpdated);
    if (!busy) void loadState();
    const timer = window.setInterval(() => {
      if (!busy) void loadState();
    }, 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(POS_SESSION_EVENT_NAME, onSessionUpdated);
    };
  }, [applySessionState, busy, loadState]);

  const logoutToBranchSelection = useCallback(async () => {
    const { response, body } = await fetchJsonWithTimeout(
      "/api/auth/session/logout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "switch_branch" })
      },
      10000
    );
    const logoutBody = body as { data?: { redirect_to?: string } | null; error?: { message?: string } | null } | null;
    if (!response.ok) {
      throw new Error(logoutBody?.error?.message ?? copy.unknownError);
    }
    window.location.assign(logoutBody?.data?.redirect_to ?? "/login/branches?flow=multi");
  }, [copy.unknownError]);

  const closeShift = useCallback(
    async (closingCashValue: number) => {
      if (!shift) return;
      const { response, body } = await fetchJsonWithTimeout(
        "/api/pos/shifts/close",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ closing_cash: closingCashValue, quick_close: true })
        },
        12000
      );
      if (!response.ok) {
        throw new Error(body?.error?.message ?? copy.unknownError);
      }
    },
    [copy.unknownError, shift]
  );

  async function handleContinueToNextShift() {
    if (!shift || busy) return;
    setBusy("continue");
    setError(null);
    try {
      await closeShift(0);
      const { response, body } = await fetchJsonWithTimeout(
        "/api/pos/shifts/open",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opening_cash: 0 })
        },
        12000
      );
      if (!response.ok) {
        throw new Error(body?.error?.message ?? copy.unknownError);
      }
      await loadState();
    } catch (continueError) {
      setError(toErrorMessage(continueError));
    } finally {
      setBusy(null);
    }
  }

  async function handleManualClose() {
    if (!shift || busy) return;
    const parsed = Number(closingCash.trim() || "0");
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(copy.invalidClosingCash);
      return;
    }
    setBusy("close");
    setError(null);
    try {
      await closeShift(parsed);
      await logoutToBranchSelection();
    } catch (closeError) {
      setError(toErrorMessage(closeError));
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!shift || !cycle) return;
    if (phase !== "auto_close") return;
    if (autoCloseRunRef.current === shift.id) return;
    autoCloseRunRef.current = shift.id;
    setBusy("autoclose");
    setError(null);
    void closeShift(0)
      .then(() => logoutToBranchSelection())
      .catch((closeError) => {
        setError(toErrorMessage(closeError));
        setBusy(null);
      });
  }, [closeShift, cycle, logoutToBranchSelection, phase, shift, toErrorMessage]);

  if (loading || !shift || !cycle || phase === "on_time") return null;

  const forceClose = phase === "urgent" || phase === "auto_close";
  const progressText = busy === "continue" ? copy.continuingProgress : busy ? copy.closingProgress : null;

  return (
    <>
      <div className="fixed inset-0 z-[95] bg-slate-950/45 backdrop-blur-[2px]" />
      <section className="fixed left-1/2 top-1/2 z-[100] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-slate-900">{copy.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{copy.subtitle}</p>
          </div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            {slotLabel(cycle.slot, lang)} - {slotWindowLabel(cycle.slot, lang)}
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p>
            {copy.opened}: <strong>{formatDateTime(shift.opened_at, lang)}</strong>
          </p>
          <p>
            {copy.windowEnded}: <strong>{formatDateTime(cycle.endAt.toISOString(), lang)}</strong>
          </p>
          {phase === "urgent" ? <p className="mt-1 font-bold text-amber-700">{copy.urgentHint}</p> : null}
          {phase === "auto_close" ? <p className="mt-1 font-bold text-rose-700">{copy.autoClosing}</p> : null}
        </div>

        {progressText ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-800">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" aria-hidden />
            <span>{progressText}</span>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}
        <p className="mt-4 text-xs text-slate-500">{copy.logoutHint}</p>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {!forceClose ? (
            <button
              type="button"
              onClick={() => void handleContinueToNextShift()}
              disabled={Boolean(busy)}
              className="h-10 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            >
              {busy === "continue" ? copy.continuingProgress : copy.continueLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowCloseModal(true)}
            disabled={Boolean(busy)}
            className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {busy && busy !== "continue" ? copy.closingProgress : copy.closeLabel}
          </button>
        </div>
      </section>

      {showCloseModal ? (
        <section className="fixed left-1/2 top-1/2 z-[110] w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
          <h4 className="text-lg font-black text-slate-900">{busy === "close" ? copy.closingProgress : copy.closeNowTitle}</h4>
          <p className="mt-1 text-sm text-slate-600">{copy.closeNowDesc}</p>
          {busy === "close" ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-800">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" aria-hidden />
              <span>{copy.closingProgress}</span>
            </div>
          ) : null}
          <label className="mt-3 grid gap-1 text-sm font-semibold text-slate-700">
            {copy.closingCash}
            <input
              type="number"
              step="0.01"
              min={0}
              value={closingCash}
              disabled={Boolean(busy)}
              onChange={(event) => {
                setClosingCash(event.target.value);
                if (error) setError(null);
              }}
              className="h-11 rounded-xl border border-slate-300 px-3 disabled:bg-slate-100 disabled:text-slate-500"
              placeholder="0.00"
            />
          </label>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={Boolean(busy)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {copy.print}
            </button>
            <button
              type="button"
              onClick={() => setShowCloseModal(false)}
              disabled={Boolean(busy)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleManualClose()}
              disabled={Boolean(busy)}
              className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy === "close" ? copy.closingProgress : copy.confirmClose}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
