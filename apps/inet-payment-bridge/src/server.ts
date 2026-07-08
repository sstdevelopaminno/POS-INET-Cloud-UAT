import "dotenv/config";
import Fastify from "fastify";
import { registerHealthRoute } from "./routes/health.js";
import { registerInetCallbackRoute } from "./routes/inet-callback.js";
import { registerInetCreateQrRoute } from "./routes/inet-create-qr.js";

const serviceName = process.env.SERVICE_NAME?.trim() || "inet-payment-bridge";
const port = Number(process.env.PORT || 8787);

const app = Fastify({
  logger: true,
  bodyLimit: 1024 * 1024
});

app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
  const rawBody = typeof body === "string" ? body : body.toString("utf8");
  request.rawBody = rawBody;
  try {
    done(null, rawBody ? JSON.parse(rawBody) : {});
  } catch (error) {
    done(error as Error);
  }
});

registerHealthRoute(app, serviceName);
registerInetCreateQrRoute(app);
registerInetCallbackRoute(app);

app.get("/ip", async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: true, ip: null, source: "unavailable" };
    }
    const payload = (await response.json()) as { ip?: string };
    return { ok: true, ip: payload.ip ?? null, source: "api.ipify.org" };
  } catch {
    return { ok: true, ip: null, source: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
});

async function main() {
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
