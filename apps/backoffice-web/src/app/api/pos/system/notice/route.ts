import { NextResponse } from "next/server";
import { PosGuardError, requirePermission, requirePosSession, withPosSessionCookie } from "@/lib/pos-session-guard";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type NoticeMode = "none" | "billing_lock" | "incident_lock" | "minor_maintenance" | "major_maintenance";
type BannerLevel = "info" | "warning" | "danger";

type RuntimeNoticeConfig = {
  mode?: NoticeMode;
  message_th?: string;
  message_en?: string;
  title_th?: string;
  title_en?: string;
  start_at?: string | null;
  end_at?: string | null;
  payment_url?: string | null;
  payment_qr_url?: string | null;
  action_url?: string | null;
  action_label_th?: string;
  action_label_en?: string;
};

type ContractRow = {
  status: string;
  ended_at: string | null;
  metadata: Record<string, unknown> | null;
};

type NoticePayload = {
  mode: NoticeMode;
  lock_all_menus: boolean;
  banner: {
    level: BannerLevel;
    message_th: string;
    message_en: string;
    start_at: string | null;
    end_at: string | null;
  } | null;
  popup: {
    title_th: string;
    title_en: string;
    message_th: string;
    message_en: string;
    action_label_th: string | null;
    action_label_en: string | null;
    action_url: string | null;
    payment_qr_url: string | null;
  } | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNoticeMode(value: unknown): NoticeMode {
  const raw = asString(value);
  if (raw === "billing_lock" || raw === "incident_lock" || raw === "minor_maintenance" || raw === "major_maintenance" || raw === "none") {
    return raw;
  }
  return "none";
}

function parseRuntimeNotice(metadata: Record<string, unknown> | null): RuntimeNoticeConfig | null {
  const config = asObject(metadata ? metadata["pos_runtime_notice"] : null);
  if (!config) return null;
  return {
    mode: parseNoticeMode(config.mode),
    message_th: asString(config.message_th),
    message_en: asString(config.message_en),
    title_th: asString(config.title_th),
    title_en: asString(config.title_en),
    start_at: asString(config.start_at) || null,
    end_at: asString(config.end_at) || null,
    payment_url: asString(config.payment_url) || null,
    payment_qr_url: asString(config.payment_qr_url) || null,
    action_url: asString(config.action_url) || null,
    action_label_th: asString(config.action_label_th),
    action_label_en: asString(config.action_label_en)
  };
}

function isContractInactive(contract: ContractRow | null) {
  if (!contract) return true;
  if (contract.status !== "active" && contract.status !== "trial") return true;
  if (contract.ended_at) {
    const endedAtMs = new Date(contract.ended_at).getTime();
    if (Number.isFinite(endedAtMs) && endedAtMs <= Date.now()) return true;
  }
  return false;
}

function buildBillingLock(config: RuntimeNoticeConfig | null): NoticePayload {
  const actionUrl = config?.payment_url ?? config?.action_url ?? null;
  return {
    mode: "billing_lock",
    lock_all_menus: true,
    banner: null,
    popup: {
      title_th: config?.title_th || "ระบบถูกระงับการใช้งานชั่วคราว",
      title_en: config?.title_en || "Service temporarily suspended",
      message_th: config?.message_th || "คุณมีค่าบริการ SSTiPOS ที่ครบกำหนดชำระแล้ว กรุณาชำระเพื่อปลดล็อกระบบขาย",
      message_en: config?.message_en || "Your SSTiPOS subscription payment is overdue. Please complete payment to unlock sales.",
      action_label_th: actionUrl ? config?.action_label_th || "ชำระค่าบริการ" : null,
      action_label_en: actionUrl ? config?.action_label_en || "Pay now" : null,
      action_url: actionUrl,
      payment_qr_url: config?.payment_qr_url ?? null
    }
  };
}

function buildIncidentLock(config: RuntimeNoticeConfig | null): NoticePayload {
  return {
    mode: "incident_lock",
    lock_all_menus: true,
    banner: null,
    popup: {
      title_th: config?.title_th || "ระบบอยู่ระหว่างตรวจสอบ",
      title_en: config?.title_en || "System under investigation",
      message_th: config?.message_th || "ตรวจพบเหตุขัดข้อง ระบบกำลังเร่งแก้ไข กรุณารอสักครู่",
      message_en: config?.message_en || "A critical issue was detected. We are investigating and fixing it urgently.",
      action_label_th: null,
      action_label_en: null,
      action_url: null,
      payment_qr_url: null
    }
  };
}

function buildMinorMaintenance(config: RuntimeNoticeConfig | null): NoticePayload {
  return {
    mode: "minor_maintenance",
    lock_all_menus: false,
    banner: {
      level: "info",
      message_th: config?.message_th || "ระบบกำลังปรับปรุงเล็กน้อย บางฟังก์ชันอาจทำงานช้ากว่าปกติ",
      message_en: config?.message_en || "Minor maintenance is in progress. Some features may respond slower than usual.",
      start_at: config?.start_at ?? null,
      end_at: config?.end_at ?? null
    },
    popup: null
  };
}

function buildMajorMaintenance(config: RuntimeNoticeConfig | null): NoticePayload {
  return {
    mode: "major_maintenance",
    lock_all_menus: true,
    banner: {
      level: "warning",
      message_th: config?.message_th || "ระบบปิดปรับปรุงชั่วคราว กรุณารอช่วงเวลาที่ประกาศ",
      message_en: config?.message_en || "System is under major maintenance. Please wait until the announced window ends.",
      start_at: config?.start_at ?? null,
      end_at: config?.end_at ?? null
    },
    popup: {
      title_th: config?.title_th || "ระบบอยู่ระหว่างปรับปรุง",
      title_en: config?.title_en || "Scheduled maintenance",
      message_th: config?.message_th || "ระบบขายถูกล็อกชั่วคราวตามเวลาปรับปรุงที่ประกาศ",
      message_en: config?.message_en || "Sales access is temporarily locked during the maintenance window.",
      action_label_th: null,
      action_label_en: null,
      action_url: null,
      payment_qr_url: null
    }
  };
}

function buildFromMode(mode: NoticeMode, config: RuntimeNoticeConfig | null): NoticePayload {
  if (mode === "billing_lock") return buildBillingLock(config);
  if (mode === "incident_lock") return buildIncidentLock(config);
  if (mode === "minor_maintenance") return buildMinorMaintenance(config);
  if (mode === "major_maintenance") return buildMajorMaintenance(config);
  return { mode: "none", lock_all_menus: false, banner: null, popup: null };
}

export async function GET() {
  try {
    const scope = await requirePosSession();
    requirePermission(scope, "system:notice:view");
    const supabase = getSupabaseServiceClient();

    const { data: contract, error } = await supabase
      .from("tenant_subscription_contracts")
      .select("status,ended_at,metadata")
      .eq("tenant_id", scope.session.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ContractRow>();

    if (error) {
      return withPosSessionCookie(
        NextResponse.json(
          {
            data: { mode: "none", lock_all_menus: false, banner: null, popup: null, source: "contract_query_failed" },
            error: null
          },
          { status: 200 }
        ),
        scope.session.id
      );
    }

    const runtimeConfig = parseRuntimeNotice(contract?.metadata ?? null);
    const contractInactive = isContractInactive(contract ?? null);

    let payload: NoticePayload = { mode: "none", lock_all_menus: false, banner: null, popup: null };
    if (contractInactive) {
      payload = buildBillingLock(runtimeConfig);
    } else {
      const requestedMode = runtimeConfig?.mode ?? "none";
      payload = buildFromMode(requestedMode, runtimeConfig);
    }

    const response = NextResponse.json({
      data: {
        ...payload,
        source: contractInactive ? "contract_status" : "runtime_notice",
        role: scope.session.role
      },
      error: null
    });
    return withPosSessionCookie(response, scope.session.id);
  } catch (error) {
    if (error instanceof PosGuardError) {
      return NextResponse.json({ data: null, error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json({ data: null, error: { code: "pos_notice_failed", message: "Unable to load POS notice status." } }, { status: 500 });
  }
}
