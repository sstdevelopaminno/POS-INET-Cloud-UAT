import type { FastifyInstance } from "fastify";
import { isBridgeRequestAuthorized } from "../lib/bridge-auth.js";
import { getInetBridgeConfigStatus } from "../lib/inet-client.js";

export function registerHealthRoute(app: FastifyInstance, serviceName: string) {
  app.get("/health", async () => ({
    ok: true,
    service: serviceName,
    time: new Date().toISOString()
  }));

  app.get("/health/config", async (request, reply) => {
    if (!isBridgeRequestAuthorized(request.headers["x-bridge-api-key"])) {
      return reply.code(401).send({
        ok: false,
        error: "invalid_bridge_api_key"
      });
    }

    return {
      ok: true,
      service: serviceName,
      time: new Date().toISOString(),
      config: getInetBridgeConfigStatus()
    };
  });
}
