import { Buffer } from "node:buffer";
import { appendAuditLog } from "@/lib/audit-log";
import { getPosApiAuthContext } from "@/lib/pos-api-auth";
import { readEnv } from "@/lib/env";
import { fail, ok } from "@/lib/http";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type ParsedSlip = {
  payer_name: string | null;
  payee_name: string | null;
  amount: number | null;
  transfer_datetime: string | null;
  transaction_id: string | null;
  reference_no: string | null;
  confidence: number | null;
};

type VerificationChecks = {
  amount_match: boolean;
  payee_match: boolean;
  datetime_present: boolean;
  confidence_pass: boolean;
  passed: boolean;
  issues: string[];
};

const DEFAULT_OCR_MODEL = readEnv("POS_SLIP_OCR_MODEL") ?? "gpt-4.1-mini";
const DEFAULT_MIN_CONFIDENCE_RAW = Number(readEnv("POS_SLIP_OCR_MIN_CONFIDENCE") ?? "0.6");
const DEFAULT_MIN_CONFIDENCE = Number.isFinite(DEFAULT_MIN_CONFIDENCE_RAW)
  ? Math.min(1, Math.max(0, DEFAULT_MIN_CONFIDENCE_RAW))
  : 0.6;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toInt(value: string | null, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[^\d]/g, "");
}

function parseJsonFromText(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(num) ? num : null;
}

function normalizeParsedSlip(candidate: Record<string, unknown> | null): ParsedSlip {
  return {
    payer_name: asString(candidate?.payer_name),
    payee_name: asString(candidate?.payee_name),
    amount: asNumber(candidate?.amount),
    transfer_datetime: asString(candidate?.transfer_datetime),
    transaction_id: asString(candidate?.transaction_id),
    reference_no: asString(candidate?.reference_no),
    confidence: asNumber(candidate?.confidence)
  };
}

function extractOutputText(payload: unknown): string {
  const body = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }
  const chunks: string[] = [];
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

async function parseSlipWithOpenAi(args: {
  fileBase64: string;
  mimeType: string;
  expectedAmount: number;
  expectedPayeeName: string;
  expectedPromptPayPhone: string;
}): Promise<ParsedSlip> {
  const apiKey = readEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Configure OCR key or switch POS_SLIP_VERIFY_MODE=mock.");
  }

  const instruction = [
    "Extract Thai transfer slip fields and return only valid JSON.",
    "JSON keys: payer_name, payee_name, amount, transfer_datetime, transaction_id, reference_no, confidence.",
    "Rules:",
    "- amount must be numeric (no currency symbol).",
    "- transfer_datetime keep as string found on slip.",
    "- confidence is 0..1.",
    "- if unknown use null.",
    `Expected amount: ${args.expectedAmount}`,
    `Expected payee name: ${args.expectedPayeeName || "-"}`,
    `Expected PromptPay phone: ${args.expectedPromptPayPhone || "-"}`
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEFAULT_OCR_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: instruction },
            {
              type: "input_image",
              image_url: `data:${args.mimeType};base64,${args.fileBase64}`
            }
          ]
        }
      ]
    })
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "error" in payload
        ? ((payload as { error?: { message?: string } }).error?.message ?? "OCR request failed.")
        : "OCR request failed.";
    throw new Error(detail);
  }

  const outputText = extractOutputText(payload);
  const parsedJson = parseJsonFromText(outputText);
  return normalizeParsedSlip(parsedJson);
}

function buildChecks(args: {
  parsed: ParsedSlip;
  expectedAmount: number;
  expectedPayeeName: string;
  expectedPromptPayPhone: string;
}): VerificationChecks {
  const parsedAmountRounded = args.parsed.amount === null ? null : Math.max(0, Math.round(args.parsed.amount));
  const amountMatch = parsedAmountRounded !== null && parsedAmountRounded === args.expectedAmount;

  const normalizedExpectedPayee = normalizeText(args.expectedPayeeName);
  const normalizedParsedPayee = normalizeText(args.parsed.payee_name);
  const expectedPhoneDigits = extractDigits(args.expectedPromptPayPhone);
  const parsedPayeeDigits = extractDigits(args.parsed.payee_name);
  const payeeMatch =
    normalizedExpectedPayee.length > 0
      ? normalizedParsedPayee.includes(normalizedExpectedPayee) || normalizedExpectedPayee.includes(normalizedParsedPayee)
      : expectedPhoneDigits.length > 0
        ? parsedPayeeDigits.length > 0
          ? parsedPayeeDigits.includes(expectedPhoneDigits)
          : true
        : true;

  const datetimePresent = Boolean(args.parsed.transfer_datetime);
  const confidenceValue = args.parsed.confidence;
  const confidencePass = confidenceValue === null ? false : confidenceValue >= DEFAULT_MIN_CONFIDENCE;

  const issues: string[] = [];
  if (!amountMatch) {
    issues.push(`Amount mismatch: expected ${args.expectedAmount}, got ${parsedAmountRounded ?? "-"}.`);
  }
  if (!payeeMatch) {
    issues.push("Payee does not match expected account.");
  }
  if (!datetimePresent) {
    issues.push("Transfer date/time was not detected.");
  }
  if (!confidencePass) {
    issues.push(`OCR confidence is too low (min ${Math.round(DEFAULT_MIN_CONFIDENCE * 100)}%).`);
  }

  return {
    amount_match: amountMatch,
    payee_match: payeeMatch,
    datetime_present: datetimePresent,
    confidence_pass: confidencePass,
    passed: issues.length === 0,
    issues
  };
}

export async function POST(req: Request) {
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true, requiredPermission: "sale:create" });
    const supabase = getSupabaseServiceClient();

    const formData = await req.formData();
    const file = formData.get("slip_image");
    const orderIdRaw = String(formData.get("order_id") ?? "").trim();
    const expectedAmount = toInt(formData.get("expected_amount")?.toString() ?? "0", 0);
    const expectedPayeeName = (formData.get("expected_payee_name")?.toString() ?? "").trim();
    const expectedPromptPayPhone = (formData.get("expected_promptpay_phone")?.toString() ?? "").trim();

    if (!(file instanceof File)) {
      return fail("missing_slip_image", "slip_image is required.", 422);
    }
    if (!orderIdRaw || !isUuid(orderIdRaw)) {
      return fail("invalid_order_id", "order_id is required and must be UUID.", 422);
    }
    if (!file.type.startsWith("image/")) {
      return fail("invalid_file_type", "Slip file must be an image.", 422);
    }
    if (file.size > 8 * 1024 * 1024) {
      return fail("file_too_large", "Slip image must be <= 8 MB.", 422);
    }

    const verifyMode = (readEnv("POS_SLIP_VERIFY_MODE") ?? "").toLowerCase();

    try {
      let parsed: ParsedSlip;
      if (verifyMode === "mock") {
        parsed = {
          payer_name: "Mock Payer",
          payee_name: expectedPayeeName || expectedPromptPayPhone || "PromptPay",
          amount: expectedAmount,
          transfer_datetime: new Date().toISOString(),
          transaction_id: `MOCK-${Date.now()}`,
          reference_no: `MOCK-${Date.now()}`,
          confidence: 0.99
        };
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const fileBase64 = Buffer.from(arrayBuffer).toString("base64");
        parsed = await parseSlipWithOpenAi({
          fileBase64,
          mimeType: file.type,
          expectedAmount,
          expectedPayeeName,
          expectedPromptPayPhone
        });
      }

      const checks = buildChecks({
        parsed,
        expectedAmount,
        expectedPayeeName,
        expectedPromptPayPhone
      });

      const { data: insertedRow, error: insertError } = await supabase
        .from("transfer_payment_verifications")
        .insert({
          tenant_id: auth.tenantId!,
          branch_id: auth.branchId!,
          order_id: orderIdRaw,
          verified_by: auth.userId,
          verification_status: checks.passed ? "passed" : "failed",
          expected_amount: expectedAmount,
          expected_promptpay_phone: expectedPromptPayPhone || null,
          expected_payee_name: expectedPayeeName || null,
          parsed_payer_name: parsed.payer_name,
          parsed_payee_name: parsed.payee_name,
          parsed_amount: parsed.amount,
          parsed_transfer_datetime: parsed.transfer_datetime,
          parsed_transaction_id: parsed.transaction_id,
          parsed_reference_no: parsed.reference_no,
          ocr_confidence: parsed.confidence,
          checks,
          parsed_payload: parsed,
          issues: checks.issues
        })
        .select("id")
        .single<{ id: string }>();

      if (insertError || !insertedRow?.id) {
        throw new Error(insertError?.message ?? "Failed to save transfer verification.");
      }

      void appendAuditLog({
        tenantId: auth.tenantId!,
        branchId: auth.branchId!,
        actorUserId: auth.userId,
        actorRole: auth.branchRole ?? auth.platformRole,
        action: checks.passed ? "transfer_slip_verify_passed" : "transfer_slip_verify_failed",
        targetTable: "transfer_payment_verifications",
        targetId: insertedRow.id,
        metadata: {
          order_id: orderIdRaw,
          expected_amount: expectedAmount,
          checks,
          issues: checks.issues
        }
      });

      return ok({
        verification_id: insertedRow.id,
        parsed,
        checks
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to verify slip.";

      const parsedFallback: ParsedSlip = {
        payer_name: null,
        payee_name: null,
        amount: null,
        transfer_datetime: null,
        transaction_id: null,
        reference_no: null,
        confidence: null
      };
      const checksFallback: VerificationChecks = {
        amount_match: false,
        payee_match: false,
        datetime_present: false,
        confidence_pass: false,
        passed: false,
        issues: [errorMessage]
      };

      let errorRowId = "";
      try {
        const { data: errorRow } = await supabase
          .from("transfer_payment_verifications")
          .insert({
            tenant_id: auth.tenantId!,
            branch_id: auth.branchId!,
            order_id: orderIdRaw,
            verified_by: auth.userId,
            verification_status: "error",
            expected_amount: expectedAmount,
            expected_promptpay_phone: expectedPromptPayPhone || null,
            expected_payee_name: expectedPayeeName || null,
            checks: checksFallback,
            parsed_payload: parsedFallback,
            issues: checksFallback.issues,
            error_code: "slip_verify_failed",
            error_message: errorMessage
          })
          .select("id")
          .maybeSingle<{ id: string }>();
        errorRowId = errorRow?.id ?? "";
      } catch {
        errorRowId = "";
      }

      void appendAuditLog({
        tenantId: auth.tenantId!,
        branchId: auth.branchId!,
        actorUserId: auth.userId,
        actorRole: auth.branchRole ?? auth.platformRole,
        action: "transfer_slip_verify_error",
        targetTable: "transfer_payment_verifications",
        targetId: errorRowId || undefined,
        metadata: {
          order_id: orderIdRaw,
          expected_amount: expectedAmount,
          message: errorMessage
        }
      });

      return ok({
        verification_id: errorRowId,
        parsed: parsedFallback,
        checks: checksFallback
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Slip verification request failed.";
    const normalized = message.toLowerCase();
    const authRelated = normalized.includes("authenticated") || normalized.includes("tenant/branch claims");
    return fail(authRelated ? "unauthorized" : "slip_verify_request_failed", message, authRelated ? 401 : 400);
  }
}
