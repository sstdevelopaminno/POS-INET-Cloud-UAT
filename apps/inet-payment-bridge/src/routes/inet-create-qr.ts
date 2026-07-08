import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createInetQr } from "../lib/inet-client.js";

const createQrSchema = z.object({
  order_id: z.string().trim().min(1).max(30),
  amount: z.coerce.number().positive(),
  idempotency_key: z.string().trim().min(8).max(120)
});

const createQrCache = new Map<string, Awaited<ReturnType<typeof createInetQr>>>();

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isAuthorized(requestKey: string | string[] | undefined) {
  const apiKey = process.env.BRIDGE_API_KEY?.trim();
  if (!apiKey) return true;
  return headerValue(requestKey) === apiKey;
}

export function registerInetCreateQrRoute(app: FastifyInstance) {
  app.post("/inet/create-qr", async (request, reply) => {
    if (!isAuthorized(request.headers["x-bridge-api-key"])) {
      return reply.code(401).send({
        ok: false,
        error: "invalid_bridge_api_key"
      });
    }

    const parsed = createQrSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_request",
        details: parsed.error.flatten()
      });
    }

    const cached = createQrCache.get(parsed.data.idempotency_key);
    if (cached) {
      return { ok: true, idempotent: true, ...cached };
    }

    try {
      const result = await createInetQr(parsed.data);
      createQrCache.set(parsed.data.idempotency_key, result);
      return { ok: true, idempotent: false, ...result };
    } catch (error) {
      request.log.error({ error }, "inet create qr failed");
      return reply.code(502).send({
        ok: false,
        error: "inet_create_qr_failed"
      });
    }
  });
}
