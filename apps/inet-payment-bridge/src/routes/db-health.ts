import type { FastifyInstance } from "fastify";
import { isBridgeRequestAuthorized } from "../lib/bridge-auth.js";
import { checkInetPostgres } from "../lib/postgres-health.js";

export function registerDbHealthRoute(app: FastifyInstance, serviceName: string) {
  app.get("/db/health", async (request, reply) => {
    if (!isBridgeRequestAuthorized(request.headers["x-bridge-api-key"])) {
      return reply.code(401).send({
        ok: false,
        error: "invalid_bridge_api_key"
      });
    }

    const database = checkInetPostgres();
    if (!database.ok) {
      return reply.code(503).send({
        ok: false,
        service: serviceName,
        time: new Date().toISOString(),
        database
      });
    }

    return {
      ok: true,
      service: serviceName,
      time: new Date().toISOString(),
      database
    };
  });
}
