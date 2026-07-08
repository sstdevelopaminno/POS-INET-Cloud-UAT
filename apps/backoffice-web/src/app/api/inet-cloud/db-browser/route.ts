import { fail, ok } from "@/lib/http";
import { readEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BridgePayload = {
  ok?: boolean;
  tables?: unknown;
  data?: unknown;
  error?: string;
};

function normalizeBridgeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function authorize(request: Request) {
  const healthKey = readEnv("INET_CLOUD_HEALTH_API_KEY");
  if (!healthKey) {
    return { ok: false as const, error: "health_key_missing" };
  }

  return request.headers.get("x-inet-cloud-health-key")?.trim() === healthKey
    ? { ok: true as const }
    : { ok: false as const, error: "invalid_health_key" };
}

async function readJson(response: Response): Promise<BridgePayload> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as BridgePayload;
  } catch {
    return { ok: false, error: "bridge_non_json_response" };
  }
}

export async function GET(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return fail(auth.error, "INET Cloud DB browser is not authorized.", auth.error === "health_key_missing" ? 503 : 401);
  }

  const bridgeUrl = readEnv("INET_PAYMENT_BRIDGE_URL");
  const bridgeApiKey = readEnv("INET_PAYMENT_BRIDGE_API_KEY");
  if (!bridgeUrl || !bridgeApiKey) {
    return fail("inet_bridge_env_missing", "INET payment bridge URL/API key is not configured.", 503);
  }

  const url = new URL(request.url);
  const table = url.searchParams.get("table")?.trim();
  const limit = url.searchParams.get("limit")?.trim() || "100";
  const offset = url.searchParams.get("offset")?.trim() || "0";
  const path = table
    ? `/db/tables/${encodeURIComponent(table)}?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
    : "/db/tables";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${normalizeBridgeUrl(bridgeUrl)}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-bridge-api-key": bridgeApiKey
      },
      signal: controller.signal,
      cache: "no-store"
    });
    const payload = await readJson(response);
    if (!response.ok || payload.ok !== true) {
      return fail("inet_cloud_db_browser_failed", payload.error ?? `Bridge returned ${response.status}.`, 502);
    }

    return ok(table ? payload.data : payload.tables);
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "INET Cloud DB browser request timed out."
      : "INET Cloud DB browser could not reach the bridge.";
    return fail("inet_cloud_db_browser_unreachable", message, 502);
  } finally {
    clearTimeout(timeout);
  }
}
