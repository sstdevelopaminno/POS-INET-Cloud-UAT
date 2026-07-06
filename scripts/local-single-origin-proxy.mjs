import http from "node:http";

const proxyHost = process.env.POS_PROXY_HOST ?? "127.0.0.1";
const proxyPort = Number(process.env.POS_PROXY_PORT ?? 8788);
const idOrigin = process.env.POS_PROXY_ID_ORIGIN ?? "https://sstipos-id.vercel.app";
const posOrigin = process.env.POS_PROXY_POS_ORIGIN ?? "https://sstipos-ten.vercel.app";

const posOriginHost = new URL(posOrigin).host;

function chooseOrigin(urlPath = "/", referer = "") {
  if (urlPath.startsWith("/pos/") || urlPath.startsWith("/api/pos/")) {
    return posOrigin;
  }

  if (urlPath.startsWith("/_next/")) {
    if (referer.includes("/pos/")) return posOrigin;
    return idOrigin;
  }

  return idOrigin;
}

function shouldRewriteBody(contentType = "") {
  return contentType.includes("application/json") || contentType.includes("text/html");
}

function rewriteTextBody(text, proxyBase) {
  return text
    .replaceAll(idOrigin, proxyBase)
    .replaceAll(posOrigin, proxyBase)
    .replaceAll(`https://${posOriginHost}`, proxyBase);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = req.url ?? "/";
  const referer = String(req.headers.referer ?? "");
  const origin = chooseOrigin(requestUrl, referer);
  const targetUrl = new URL(requestUrl, origin).toString();
  const proxyBase = `http://${proxyHost}:${proxyPort}`;

  try {
    const body = await readBody(req);
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      const lowerKey = key.toLowerCase();
      if (lowerKey === "host" || lowerKey === "connection" || lowerKey === "content-length") continue;
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else {
        headers.set(key, value);
      }
    }

    const init = {
      method: req.method ?? "GET",
      headers,
      redirect: "manual"
    };

    if (!["GET", "HEAD"].includes(init.method) && body.length > 0) {
      init.body = body;
      init.duplex = "half";
    }

    const upstream = await fetch(targetUrl, init);
    const contentType = String(upstream.headers.get("content-type") ?? "");

    res.statusCode = upstream.status;

    for (const [key, value] of upstream.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "set-cookie") continue;
      if (lowerKey === "content-length") continue;
      if (lowerKey === "location") {
        const rewrittenLocation = value
          .replaceAll(idOrigin, proxyBase)
          .replaceAll(posOrigin, proxyBase)
          .replaceAll(`https://${posOriginHost}`, proxyBase);
        res.setHeader(key, rewrittenLocation);
        continue;
      }
      res.setHeader(key, value);
    }

    if (typeof upstream.headers.getSetCookie === "function") {
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length > 0) {
        res.setHeader("set-cookie", cookies);
      }
    }

    if (shouldRewriteBody(contentType)) {
      const text = await upstream.text();
      const rewritten = rewriteTextBody(text, proxyBase);
      res.setHeader("content-length", Buffer.byteLength(rewritten, "utf8"));
      res.end(rewritten);
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("content-length", buffer.length);
    res.end(buffer);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify(
        {
          error: "proxy_upstream_error",
          message: error instanceof Error ? error.message : String(error),
          targetUrl
        },
        null,
        2
      )
    );
  }
});

server.listen(proxyPort, proxyHost, () => {
  console.log(`Single-origin proxy listening at http://${proxyHost}:${proxyPort}`);
  console.log(`ID origin: ${idOrigin}`);
  console.log(`POS origin: ${posOrigin}`);
});
