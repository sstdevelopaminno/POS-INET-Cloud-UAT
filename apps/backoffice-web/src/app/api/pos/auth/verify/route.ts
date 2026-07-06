import { NextResponse } from "next/server";
import { withPosSessionCookie } from "@/lib/pos-session-guard";

type VerifyMethod = "pin" | "staff_card";

function resolvePathByMethod(method: VerifyMethod) {
  if (method === "pin") return "/api/auth/pin/verify";
  return "/api/auth/staff-card/verify";
}

function normalizeMethod(value: unknown): VerifyMethod | null {
  if (value === "pin" || value === "staff_card") return value;
  return null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ data: null, error: { code: "invalid_payload", message: "Invalid verification payload." } }, { status: 400 });
  }

  const method = normalizeMethod(body.method);
  const ctx = String(body.ctx ?? "").trim();
  if (!method) {
    return NextResponse.json({ data: null, error: { code: "unsupported_method", message: "Only pin and staff_card methods are supported." } }, { status: 400 });
  }
  if (!ctx) {
    return NextResponse.json({ data: null, error: { code: "missing_context", message: "Missing login context." } }, { status: 400 });
  }

  try {
    const path = resolvePathByMethod(method);
    const localUrl = new URL(path, request.url);

    const upstreamPayload: Record<string, unknown> = { ctx };
    if (method === "pin") {
      upstreamPayload.pin = String(body.pin ?? "");
      upstreamPayload.user_identifier = String(body.user_identifier ?? "").trim() || null;
    } else {
      upstreamPayload.staff_card_code = String(body.staff_card_code ?? "").trim() || null;
      upstreamPayload.card_payload = body.card_payload ?? null;
    }

    const response = await fetch(localUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upstreamPayload),
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          data?: { session_id?: string | null; redirect_to?: string | null } | null;
          error?: { code?: string; message?: string } | null;
        }
      | null;

    if (!response.ok || !payload?.data?.session_id) {
      return NextResponse.json(payload, { status: response.status });
    }

    const sessionId = String(payload.data.session_id ?? "").trim();
    if (!sessionId) {
      return NextResponse.json(
        { data: null, error: { code: "session_creation_failed", message: "Missing session id from verification result." } },
        { status: 500 }
      );
    }

    const out = NextResponse.json(
      {
        data: {
          session_id: sessionId
        },
        error: null
      },
      { status: 200 }
    );
    return withPosSessionCookie(out, sessionId);
  } catch (error) {
    console.error("[pos-auth-verify] proxy failed", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json(
      { data: null, error: { code: "auth_verify_failed", message: "Unable to verify login right now." } },
      { status: 500 }
    );
  }
}
