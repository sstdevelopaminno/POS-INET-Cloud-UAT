import { spawn } from "node:child_process";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs = 60000, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  const child = spawn("cmd.exe", ["/c", "corepack pnpm --filter backoffice-web dev"], {
    cwd: process.cwd(),
    windowsHide: true
  });

  let buffer = "";
  let ready = false;
  let lastError = "";

  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    buffer += text;
    if (buffer.includes("Ready in") || buffer.includes("Local:") || buffer.includes("http://localhost:3000")) {
      ready = true;
    }
  });

  child.stderr.on("data", (chunk) => {
    lastError += String(chunk);
  });

  const startedAt = Date.now();
  while (!ready && Date.now() - startedAt < 120000) {
    if (child.exitCode !== null) {
      throw new Error(`dev server exited early with code ${child.exitCode}. stderr=${lastError}`);
    }
    await wait(500);
  }

  if (!ready) {
    child.kill("SIGTERM");
    throw new Error(`dev server did not become ready in time. stderr=${lastError}`);
  }

  const checks = [];
  try {
    const page = await fetchWithTimeout("http://127.0.0.1:3000/login/store", 60000);
    checks.push({ name: "GET /login/store", ok: page.ok, status: page.status });

    const posPage = await fetchWithTimeout("http://127.0.0.1:3000/preview/pos", 90000);
    checks.push({ name: "GET /preview/pos", ok: posPage.ok, status: posPage.status });

    const verifyStore = await fetchWithTimeout("http://127.0.0.1:3000/api/auth/store-code/verify", 60000, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_code: "NDL-TH-001" })
    });
    const verifyStoreJson = await verifyStore.json().catch(() => null);
    checks.push({
      name: "POST /api/auth/store-code/verify",
      ok: verifyStore.ok && Boolean(verifyStoreJson?.data?.tenant?.code === "NDL-TH-001"),
      status: verifyStore.status,
      next_step: verifyStoreJson?.data?.next_step ?? null
    });
  } finally {
    child.kill("SIGTERM");
  }

  const allOk = checks.every((item) => item.ok);
  console.log(JSON.stringify({ allOk, checks }, null, 2));
  if (!allOk) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
