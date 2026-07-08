type CreateQrInput = {
  order_id: string;
  amount: number;
  idempotency_key: string;
};

type JsonObject = Record<string, unknown>;

const DEFAULT_OAUTH_PATH = "/uat/oauth/api/v1/oauth-token";
const DEFAULT_ACCESS_TOKEN_PATH = "/uat/api/v1/sandbox/payment-transactions/access-token";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function requiredEnv(name: string) {
  const value = env(name);
  if (!value) throw new Error(`missing_env:${name}`);
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

async function postJson(url: string, body: JsonObject, headers: Record<string, string> = {}) {
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
    const parsed = text ? (JSON.parse(text) as unknown) : {};
    if (!response.ok || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`inet_http_${response.status}`);
    }
    return parsed as JsonObject;
  } finally {
    clearTimeout(timeout);
  }
}

function assertCode(stage: string, payload: JsonObject, expected: number) {
  const code = findNumber(payload, ["code"]);
  if (code !== expected) throw new Error(`inet_${stage}_failed:${code ?? "missing_code"}`);
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

  const merchantKey = requiredEnv("INET_MERCHANT_KEY");
  const oauthUrl = joinUrl(apiBaseUrl, env("INET_OAUTH_PATH") || DEFAULT_OAUTH_PATH);
  const accessTokenUrl = joinUrl(apiBaseUrl, env("INET_ACCESS_TOKEN_PATH") || DEFAULT_ACCESS_TOKEN_PATH);

  const oauth = await postJson(oauthUrl, {
    key: merchantKey,
    orderId: input.order_id
  });
  assertCode("oauth", oauth, 201);
  const oauthToken = findString(oauth, ["token", "access_token", "oauthToken", "oauth_token"]);
  if (!oauthToken) throw new Error("inet_oauth_token_missing");

  const access = await postJson(
    accessTokenUrl,
    {
      key: merchantKey,
      orderId: input.order_id,
      orderDesc: `POS ${input.order_id}`,
      amount: Number(input.amount.toFixed(2)),
      apUrl: requiredEnv("INET_AP_URL"),
      payType: "QR",
      regRef: ""
    },
    { Authorization: `Bearer ${oauthToken}` }
  );
  assertCode("access_token", access, 201);
  const paymentAccessToken = findString(access, ["accessToken", "access_token"]);
  const paymentLink = findString(access, ["link", "paymentUrl", "payment_url"]);
  if (!paymentAccessToken || !paymentLink) throw new Error("inet_access_token_response_invalid");

  const qr = await postJson(paymentLink, { accessToken: paymentAccessToken });
  assertCode("create_payment", qr, 200);
  const qrCode = findString(qr, ["qrCode", "qr_code", "qrcode", "qr"]);
  if (!qrCode) throw new Error("inet_qr_missing");

  return {
    payment_ref: input.order_id,
    qr_url: asQrUrl(qrCode),
    expires_at: expiresAt,
    raw_status: "inet_200"
  };
}
