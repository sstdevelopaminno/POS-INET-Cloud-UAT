import { fail, ok } from "@/lib/http";
import { readEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BridgeDbHealthResponse = {
  ok?: boolean;
  service?: string;
  time?: string;
  database?: unknown;
  error?: string;
};

function normalizeBridgeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function isAuthorized(request: Request) {
  const healthKey = readEnv("INET_CLOUD_HEALTH_API_KEY");
  if (!healthKey) {
    return { ok: false as const, error: "health_key_missing" };
  }

  const requestKey = request.headers.get("x-inet-cloud-health-key")?.trim();
  return requestKey === healthKey
    ? { ok: true as const }
    : { ok: false as const, error: "invalid_health_key" };
}

async function readBridgeJson(response: Response): Promise<BridgeDbHealthResponse> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as BridgeDbHealthResponse;
  } catch {
    return {
      ok: false,
      error: "bridge_non_json_response"
    };
  }
}

export async function GET(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    const status = auth.error === "health_key_missing" ? 503 : 401;
    return fail(auth.error, "INET Cloud health endpoint is not authorized.", status);
  }

  const bridgeUrl = readEnv("INET_PAYMENT_BRIDGE_URL");
  const bridgeApiKey = readEnv("INET_PAYMENT_BRIDGE_API_KEY");
  if (!bridgeUrl || !bridgeApiKey) {
    return fail("inet_bridge_env_missing", "INET payment bridge URL/API key is not configured.", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${normalizeBridgeUrl(bridgeUrl)}/db/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-bridge-api-key": bridgeApiKey
      },
      signal: controller.signal,
      cache: "no-store"
    });
    const payload = await readBridgeJson(response);
    if (!response.ok || payload.ok !== true) {
      return fail(
        "inet_cloud_db_unhealthy",
        `INET Cloud PostgreSQL health check failed via bridge. ${payload.error ?? response.status}`,
        502
      );
    }

    return ok({
      target: "inet_cloud",
      bridge: {
        reachable: true,
        service: payload.service ?? "inet-payment-bridge",
        time: payload.time ?? null
      },
      database: payload.database ?? null
    });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "INET Cloud PostgreSQL health check timed out."
      : "INET Cloud PostgreSQL health check could not reach the bridge.";
    return fail("inet_cloud_db_health_failed", message, 502);
  } finally {
    clearTimeout(timeout);
  }
}
