import type { FastifyInstance } from "fastify";
import { isBridgeRequestAuthorized } from "../lib/bridge-auth.js";
import { listBrowserTables, readBrowserTable } from "../lib/postgres-browser.js";

type TableParams = {
  tableId: string;
};

type TableQuery = {
  limit?: string;
  offset?: string;
};

export function registerDbBrowserRoutes(app: FastifyInstance, serviceName: string) {
  app.get("/db/tables", async (request, reply) => {
    if (!isBridgeRequestAuthorized(request.headers["x-bridge-api-key"])) {
      return reply.code(401).send({
        ok: false,
        error: "invalid_bridge_api_key"
      });
    }

    return {
      ok: true,
      service: serviceName,
      tables: listBrowserTables()
    };
  });

  app.get<{ Params: TableParams; Querystring: TableQuery }>("/db/tables/:tableId", async (request, reply) => {
    if (!isBridgeRequestAuthorized(request.headers["x-bridge-api-key"])) {
      return reply.code(401).send({
        ok: false,
        error: "invalid_bridge_api_key"
      });
    }

    const result = readBrowserTable(request.params.tableId, request.query.limit, request.query.offset);
    if (!result.ok) {
      const status = result.error === "unknown_table" ? 404 : 503;
      return reply.code(status).send({
        ok: false,
        service: serviceName,
        error: result.error,
        detail: "detail" in result ? result.detail : undefined
      });
    }

    return {
      ok: true,
      service: serviceName,
      data: result.data
    };
  });
}
