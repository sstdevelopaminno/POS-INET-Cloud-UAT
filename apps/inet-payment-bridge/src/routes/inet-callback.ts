import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyInetCallback } from "../lib/inet-signature.js";
import { forwardInetCallbackToPos } from "../lib/pos-callback-client.js";
import { markPosPaymentPaid } from "../lib/supabase-client.js";

const callbackSchema = z.object({
  payment_ref: z.string().trim().min(1),
  order_id: z.string().trim().min(1),
  status: z.string().trim().min(1),
  amount: z.coerce.number().positive()
});

const claimedRefs = new Set<string>();
const settledRefs = new Set<string>();

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCallbackPayload(body: unknown) {
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const detail = payload.detail && typeof payload.detail === "object" ? (payload.detail as Record<string, unknown>) : {};
  const responseCode = Number(detail.response_code);
  const status =
    readString(payload.status) ||
    (Number.isFinite(responseCode) ? (responseCode === 0 ? "paid" : "failed") : "");

  return {
    payment_ref:
      readString(payload.payment_ref) ||
      readString(detail.payment_reference_id) ||
      readString(detail.order_id),
    order_id: readString(payload.order_id) || readString(detail.order_id),
    status,
    amount: payload.amount ?? detail.receive_amount
  };
}

function isPaidStatus(status: string) {
  return ["paid", "success", "completed", "settled"].includes(status.toLowerCase());
}

export function registerInetCallbackRoute(app: FastifyInstance) {
  app.post("/inet/callback", async (request, reply) => {
    const auth = verifyInetCallback({
      rawBody: request.rawBody || JSON.stringify(request.body || {}),
      headers: request.headers
    });
    if (!auth.ok) {
      return reply.code(auth.statusCode).send({ ok: false, error: auth.error });
    }

    const parsed = callbackSchema.safeParse(normalizeCallbackPayload(request.body));
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_callback",
        details: parsed.error.flatten()
      });
    }

    const paymentRef = parsed.data.payment_ref;
    const paid = isPaidStatus(parsed.data.status);

    if (!paid) {
      return {
        ok: true,
        payment_ref: paymentRef,
        status: parsed.data.status,
        settled: false
      };
    }

    if (settledRefs.has(paymentRef) || claimedRefs.has(paymentRef)) {
      return {
        ok: true,
        payment_ref: paymentRef,
        status: "duplicate",
        duplicate: true
      };
    }

    claimedRefs.add(paymentRef);
    try {
      const forwarded = await forwardInetCallbackToPos(request.rawBody || JSON.stringify(request.body || {}));
      if (!forwarded.skipped) {
        settledRefs.add(paymentRef);
        return {
          ok: true,
          payment_ref: paymentRef,
          status: "paid",
          settled: true,
          forwarded
        };
      }

      const update = await markPosPaymentPaid({
        paymentRef,
        orderId: parsed.data.order_id,
        amount: parsed.data.amount
      });
      settledRefs.add(paymentRef);
      return {
        ok: true,
        payment_ref: paymentRef,
        status: "paid",
        settled: true,
        update
      };
    } catch (error) {
      claimedRefs.delete(paymentRef);
      request.log.error({ error }, "paid callback settlement failed");
      return reply.code(500).send({
        ok: false,
        error: "settlement_failed"
      });
    }
  });
}
