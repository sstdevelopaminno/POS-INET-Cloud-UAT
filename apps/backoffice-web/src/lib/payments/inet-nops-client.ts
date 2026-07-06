import "server-only";

export type InetEnvironment = "uat" | "production";

type InetCreateQrArgs = {
  environment: InetEnvironment;
  providerOrderId: string;
  orderDesc: string;
  amount: number;
};

export type InetCreateQrResult = {
  providerOrderId: string;
  qrCode: string;
  ref1: string | null;
  ref2: string | null;
  rawCreateResponse: Record<string, unknown>;
};

export type InetNopsConnectionTestResult = {
  providerOrderId: string;
  environment: InetEnvironment;
};

type JsonObject = Record<string, unknown>;

const INET_TIMEOUT_MS = 12000;
const BRIDGE_TIMEOUT_MS = 15000;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing_env:${name}`);
  }
  return value;
}

function resolveEnvName(base: string, environment: InetEnvironment): string {
  return `${base}_${environment === "production" ? "PROD" : "UAT"}`;
}

function buildConnectionProbeOrderId() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(2, 14);
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase();
  return `TST${timestamp}${random}`;
}

export function resolveInetNopsEnvironment(value: unknown): InetEnvironment {
  return value === "production" ? "production" : "uat";
}

export function resolveInetNopsMerchantId(environment: InetEnvironment, configuredMerchantId?: string | null): string | null {
  return configuredMerchantId?.trim() || process.env[resolveEnvName("INET_NOPS_MERCHANT_ID", environment)]?.trim() || null;
}

export function allowsInetNopsUatWithoutMerchantId(environment: InetEnvironment): boolean {
  return environment === "uat" && process.env.INET_NOPS_ALLOW_MISSING_MERCHANT_ID_UAT === "true";
}

function resolveInetNopsConfig(environment: InetEnvironment) {
  return {
    merchantKey: requireEnv(resolveEnvName("INET_NOPS_MERCHANT_KEY", environment)),
    oauthUrl: requireEnv(resolveEnvName("INET_NOPS_OAUTH_URL", environment)),
    accessTokenUrl: requireEnv(resolveEnvName("INET_NOPS_ACCESS_TOKEN_URL", environment)),
    apUrl: requireEnv(resolveEnvName("INET_NOPS_AP_URL", environment))
  };
}

function resolveInetBridgeConfig() {
  const url = process.env.INET_PAYMENT_BRIDGE_URL?.trim();
  if (!url) return null;
  return {
    url: url.replace(/\/+$/, ""),
    apiKey: requireEnv("INET_PAYMENT_BRIDGE_API_KEY")
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function findString(value: unknown, keys: string[]): string | null {
  if (!isJsonObject(value)) return null;
  for (const key of keys) {
    const next = value[key];
    if (typeof next === "string" && next.trim()) return next.trim();
  }
  for (const next of Object.values(value)) {
    const nested = findString(next, keys);
    if (nested) return nested;
  }
  return null;
}

function findNumber(value: unknown, keys: string[]): number | null {
  if (!isJsonObject(value)) return null;
  for (const key of keys) {
    const next = value[key];
    if (typeof next === "number" && Number.isFinite(next)) return next;
  }
  return null;
}

function findInetErrorMessage(value: JsonObject): string | null {
  const errors = value.errors;
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      const message = findString(entry, ["message"]);
      if (message) return message;
    }
  }
  return findString(value, ["message"]);
}

function requireInetSuccessCode(stage: "oauth" | "access_token" | "create_payment", payload: JsonObject, expectedCode: number) {
  const code = findNumber(payload, ["code"]);
  if (code === expectedCode) return;
  const detail = findInetErrorMessage(payload) ?? "unexpected_response";
  throw new Error(`inet_nops_${stage}_failed:${code ?? "missing_code"}:${detail}`);
}

async function postJson(stage: "oauth" | "access_token" | "create_payment", url: string, body: JsonObject, headers: HeadersInit = {}): Promise<JsonObject> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INET_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store"
    });
    const rawText = await response.text();
    let parsed: unknown = {};
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as unknown;
      } catch {
        const kind = rawText.trimStart().startsWith("<") ? "html_response" : "non_json_response";
        if (!response.ok) {
          throw new Error(`inet_nops_${stage}_http_${response.status}:${kind}`);
        }
        throw new Error(`inet_nops_${stage}_invalid_response:${kind}`);
      }
    }
    if (!response.ok) {
      throw new Error(`inet_nops_http_${response.status}:${rawText.slice(0, 240)}`);
    }
    if (!isJsonObject(parsed)) {
      throw new Error(`inet_nops_${stage}_invalid_response`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("inet_nops_request_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function createInetQrViaBridge(args: InetCreateQrArgs, bridge: { url: string; apiKey: string }): Promise<InetCreateQrResult> {
  const amount = Number(args.amount.toFixed(2));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
  try {
    const response = await fetch(`${bridge.url}/inet/create-qr`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-bridge-api-key": bridge.apiKey
      },
      body: JSON.stringify({
        order_id: args.providerOrderId,
        amount,
        idempotency_key: args.providerOrderId
      }),
      signal: controller.signal,
      cache: "no-store"
    });
    const rawText = await response.text();
    let parsed: unknown = {};
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as unknown;
      } catch {
        throw new Error(`inet_bridge_invalid_response:${response.status}`);
      }
    }
    if (!response.ok || !isJsonObject(parsed)) {
      throw new Error(`inet_bridge_http_${response.status}`);
    }
    const qrUrl = findString(parsed, ["qr_url", "qrCode", "qr_code", "qrcode", "qr"]);
    if (!qrUrl) {
      throw new Error("inet_bridge_qr_missing");
    }
    return {
      providerOrderId: args.providerOrderId,
      qrCode: qrUrl,
      ref1: findString(parsed, ["ref1", "reference1", "reference_no_1"]),
      ref2: findString(parsed, ["ref2", "reference2", "reference_no_2"]),
      rawCreateResponse: parsed
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("inet_bridge_request_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createInetNopsQrPayment(args: InetCreateQrArgs): Promise<InetCreateQrResult> {
  const bridge = resolveInetBridgeConfig();
  if (bridge) {
    return createInetQrViaBridge(args, bridge);
  }

  const config = resolveInetNopsConfig(args.environment);
  const amount = Number(args.amount.toFixed(2));
  if (!args.providerOrderId.trim() || args.providerOrderId.length > 30) {
    throw new Error("inet_nops_invalid_order_id");
  }
  if (!Number.isFinite(amount) || amount <= 0.01) {
    throw new Error("inet_nops_amount_must_be_greater_than_0_01");
  }

  const oauthResponse = await postJson("oauth", config.oauthUrl, {
    key: config.merchantKey,
    orderId: args.providerOrderId
  });
  requireInetSuccessCode("oauth", oauthResponse, 201);
  const oauthToken = findString(oauthResponse, ["token", "access_token", "oauthToken", "oauth_token"]);
  if (!oauthToken) {
    throw new Error("inet_nops_oauth_token_missing");
  }

  const accessTokenResponse = await postJson(
    "access_token",
    config.accessTokenUrl,
    {
      key: config.merchantKey,
      orderId: args.providerOrderId,
      orderDesc: args.orderDesc,
      amount,
      apUrl: config.apUrl,
      payType: "QR",
      regRef: ""
    },
    {
      Authorization: `Bearer ${oauthToken}`
    }
  );
  requireInetSuccessCode("access_token", accessTokenResponse, 201);
  const accessToken = findString(accessTokenResponse, ["accessToken", "access_token"]);
  const createPaymentLink = findString(accessTokenResponse, ["link", "paymentUrl", "payment_url"]);
  if (!accessToken || !createPaymentLink) {
    throw new Error("inet_nops_access_token_response_invalid");
  }

  const createResponse = await postJson("create_payment", createPaymentLink, { accessToken });
  requireInetSuccessCode("create_payment", createResponse, 200);
  const qrCode = findString(createResponse, ["qrCode", "qr_code", "qrcode", "qr"]);
  if (!qrCode) {
    throw new Error("inet_nops_qr_code_missing");
  }

  return {
    providerOrderId: args.providerOrderId,
    qrCode,
    ref1: findString(createResponse, ["ref1", "reference1", "reference_no_1"]),
    ref2: findString(createResponse, ["ref2", "reference2", "reference_no_2"]),
    rawCreateResponse: createResponse
  };
}

export async function testInetNopsConnection(environment: InetEnvironment): Promise<InetNopsConnectionTestResult> {
  const config = resolveInetNopsConfig(environment);
  const providerOrderId = buildConnectionProbeOrderId();
  const oauthResponse = await postJson("oauth", config.oauthUrl, {
    key: config.merchantKey,
    orderId: providerOrderId
  });
  requireInetSuccessCode("oauth", oauthResponse, 201);
  const oauthToken = findString(oauthResponse, ["token", "access_token", "oauthToken", "oauth_token"]);
  if (!oauthToken) {
    throw new Error("inet_nops_oauth_token_missing");
  }
  return { providerOrderId, environment };
}
