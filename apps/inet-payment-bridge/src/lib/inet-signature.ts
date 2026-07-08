import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

type VerifyInput = {
  rawBody: string;
  headers: IncomingHttpHeaders;
};

type VerifyResult =
  | { ok: true }
  | { ok: false; statusCode: 401 | 500; error: string };

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function header(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeSignature(value: string) {
  return value.startsWith("sha256=") ? value.slice("sha256=".length) : value;
}

export function buildInetSignature(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyInetCallback(input: VerifyInput): VerifyResult {
  const sharedSecret = env("INET_CALLBACK_SECRET");
  const signingSecret = env("INET_CALLBACK_SIGNING_SECRET");
  const allowUnsigned = env("INET_ALLOW_UNSIGNED_CALLBACKS") === "true";

  if (!sharedSecret && !signingSecret) {
    return allowUnsigned
      ? { ok: true }
      : { ok: false, statusCode: 500, error: "callback_auth_not_configured" };
  }

  const providedSecret = header(input.headers, "x-inet-callback-secret");
  if (sharedSecret && providedSecret && safeEqual(providedSecret, sharedSecret)) {
    return { ok: true };
  }

  const providedSignature = normalizeSignature(header(input.headers, "x-inet-signature"));
  if (signingSecret && providedSignature) {
    const expected = buildInetSignature(input.rawBody, signingSecret);
    if (safeEqual(providedSignature, expected)) {
      return { ok: true };
    }
  }

  return { ok: false, statusCode: 401, error: "invalid_callback_auth" };
}
