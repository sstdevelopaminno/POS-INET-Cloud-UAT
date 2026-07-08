type CreateQrInput = {
  order_id: string;
  amount: number;
  idempotency_key: string;
};

type JsonObject = Record<string, unknown>;
type ConfigValueStatus = "configured" | "missing" | "placeholder";

const DEFAULT_OAUTH_PATH = "/uat/oauth/api/v1/oauth-token";
const DEFAULT_ACCESS_TOKEN_PATH = "/uat/api/v1/sandbox/payment-transactions/access-token";
const PLACEHOLDER_VALUES = new Set([
  "replace-with-server-only-secret",
  "replace-with-callback-shared-secret",
  "replace-with-pos-to-bridge-api-key",
  "changeme",
  "change-me",
  "placeholder",
  "secret",
  "test",
  "demo"
]);

export class InetConfigError extends Error {
  constructor(
    public readonly stage: string,
    public readonly detail: string
  ) {
    super(detail);
    this.name = "InetConfigError";
  }
}

export class InetUpstreamError extends Error {
  constructor(
    public readonly stage: string,
    public readonly detail: string,
    public readonly upstreamStatus?: number
  ) {
    super(detail);
    this.name = "InetUpstreamError";
  }
}

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function valueStatus(value: string): ConfigValueStatus {
  if (!value) return "missing";
  const normalized = value.trim().toLowerCase();
  if (PLACEHOLDER_VALUES.has(normalized) || normalized.startsWith("replace-with-") || /^<.+>$/.test(normalized)) {
    return "placeholder";
  }
  return "configured";
}

function requiredConfiguredEnv(name: string, stage: string) {
  const value = env(name);
  const status = valueStatus(value);
  if (status !== "configured") throw new InetConfigError(stage, `${name}:${status}`);
  return value;
}

function joinUrl(base: string, path: string) {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

function findString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as JsonObject;
  for (const key of keys) {
    const next = object[key];
    if (typeof next === "string" && next.trim()) return next.trim();
  }
  for (const next of Object.values(object)) {
    const nested = findString(next, keys);
    if (nested) return nested;
  }
  return null;
}

function findNumber(value: unknown, keys: string[]): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as JsonObject;
  for (const key of keys) {
    const next = object[key];
    if (typeof next === "number" && Number.isFinite(next)) return next;
  }
  return null;
}

function addMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function asQrUrl(value: string) {
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
}

async function postJson(stage: string, url: string, body: JsonObject, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env("INET_TIMEOUT_MS") || 12000));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      throw new InetUpstreamError(stage, `inet_${stage}_invalid_json`, response.status);
    }
    if (!response.ok || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new InetUpstreamError(stage, `inet_${stage}_http_${response.status}`, response.status);
    }
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof InetUpstreamError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new InetUpstreamError(stage, `inet_${stage}_timeout`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assertCode(stage: string, payload: JsonObject, expected: number) {
  const code = findNumber(payload, ["code"]);
  if (code !== expected) throw new InetUpstreamError(stage, `inet_${stage}_code_${code ?? "missing"}`);
}

export function getInetBridgeConfigStatus() {
  const apiBaseUrl = env("INET_API_BASE_URL");
  return {
    node_env: env("NODE_ENV") || "unset",
    port: env("PORT") || "8787",
    bridge_api_key: valueStatus(env("BRIDGE_API_KEY")),
    inet_mode: apiBaseUrl ? "live" : "mock",
    inet_api_base_url: apiBaseUrl || null,
    inet_oauth_path: env("INET_OAUTH_PATH") || DEFAULT_OAUTH_PATH,
    inet_access_token_path: env("INET_ACCESS_TOKEN_PATH") || DEFAULT_ACCESS_TOKEN_PATH,
    inet_merchant_key: valueStatus(env("INET_MERCHANT_KEY")),
    inet_ap_url: valueStatus(env("INET_AP_URL")),
    inet_timeout_ms: Number(env("INET_TIMEOUT_MS") || 12000),
    inet_qr_expires_minutes: Number(env("INET_QR_EXPIRES_MINUTES") || 15),
    callback_secret: valueStatus(env("INET_CALLBACK_SECRET")),
    callback_signing_secret: valueStatus(env("INET_CALLBACK_SIGNING_SECRET")),
    allow_unsigned_callbacks: env("INET_ALLOW_UNSIGNED_CALLBACKS") === "true",
    pos_inet_callback_url: valueStatus(env("POS_INET_CALLBACK_URL")),
    supabase_url: valueStatus(env("SUPABASE_URL")),
    supabase_service_role_key: valueStatus(env("SUPABASE_SERVICE_ROLE_KEY"))
  };
}

export function toSafeInetQrError(error: unknown) {
  if (error instanceof InetConfigError) {
    return {
      httpStatus: 500,
      error: "inet_bridge_config_invalid",
      stage: error.stage,
      detail: error.detail
    };
  }
  if (error instanceof InetUpstreamError) {
    return {
      httpStatus: 502,
      error: "inet_create_qr_failed",
      stage: error.stage,
      detail: error.detail
    };
  }
  return {
    httpStatus: 502,
    error: "inet_create_qr_failed",
    stage: "unknown",
    detail: error instanceof Error ? error.message : "unknown_error"
  };
}

export async function createInetQr(input: CreateQrInput) {
  const apiBaseUrl = env("INET_API_BASE_URL");
  const expiresAt = addMinutes(Number(env("INET_QR_EXPIRES_MINUTES") || 15));

  if (!apiBaseUrl) {
    return {
      payment_ref: input.order_id,
      qr_url: `mock://inet-qr/${encodeURIComponent(input.order_id)}`,
      expires_at: expiresAt,
      raw_status: "mock"
    };
  }

  const merchantKey = requiredConfiguredEnv("INET_MERCHANT_KEY", "config");
  const oauthUrl = joinUrl(apiBaseUrl, env("INET_OAUTH_PATH") || DEFAULT_OAUTH_PATH);
  const accessTokenUrl = joinUrl(apiBaseUrl, env("INET_ACCESS_TOKEN_PATH") || DEFAULT_ACCESS_TOKEN_PATH);

  const oauth = await postJson("oauth", oauthUrl, {
    key: merchantKey,
    orderId: input.order_id
  });
  assertCode("oauth", oauth, 201);
  const oauthToken = findString(oauth, ["token", "access_token", "oauthToken", "oauth_token"]);
  if (!oauthToken) throw new InetUpstreamError("oauth", "inet_oauth_token_missing");

  const access = await postJson(
    "access_token",
    accessTokenUrl,
    {
      key: merchantKey,
      orderId: input.order_id,
      orderDesc: `POS ${input.order_id}`,
      amount: Number(input.amount.toFixed(2)),
      apUrl: requiredConfiguredEnv("INET_AP_URL", "config"),
      payType: "QR",
      regRef: ""
    },
    { Authorization: `Bearer ${oauthToken}` }
  );
  assertCode("access_token", access, 201);
  const paymentAccessToken = findString(access, ["accessToken", "access_token"]);
  const paymentLink = findString(access, ["link", "paymentUrl", "payment_url"]);
  if (!paymentAccessToken || !paymentLink) {
    throw new InetUpstreamError("access_token", "inet_access_token_response_invalid");
  }

  const qr = await postJson("create_payment", paymentLink, { accessToken: paymentAccessToken });
  assertCode("create_payment", qr, 200);
  const qrCode = findString(qr, ["qrCode", "qr_code", "qrcode", "qr"]);
  if (!qrCode) throw new InetUpstreamError("create_payment", "inet_qr_missing");

  return {
    payment_ref: input.order_id,
    qr_url: asQrUrl(qrCode),
    expires_at: expiresAt,
    raw_status: "inet_200"
  };
}
