import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const targetUrl = process.env.POS_UI_QA_URL ?? "http://localhost:3000/preview/pos";
const outputDir = path.resolve("docs/qa-screenshots/pos-ui-flow-uat");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function normalizeApiPath(urlValue) {
  try {
    const parsed = new URL(urlValue);
    if (!parsed.pathname.startsWith("/api/pos/")) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

function summarizeApiEvents(events) {
  const groups = new Map();
  for (const event of events) {
    const key = `${event.method} ${event.path} ${event.status}`;
    const current = groups.get(key) ?? { method: event.method, path: event.path, status: event.status, count: 0, durations: [] };
    current.count += 1;
    if (Number.isFinite(event.duration_ms)) {
      current.durations.push(event.duration_ms);
    }
    groups.set(key, current);
  }

  const withStats = Array.from(groups.values()).map((entry) => {
    const sorted = [...entry.durations].sort((a, b) => a - b);
    const avg = sorted.length > 0 ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null;
    const p95 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null;
    return {
      method: entry.method,
      path: entry.path,
      status: entry.status,
      count: entry.count,
      avg_duration_ms: avg === null ? null : Number(avg.toFixed(2)),
      p95_duration_ms: p95 === null ? null : Number(p95.toFixed(2))
    };
  });

  return withStats.sort((a, b) => b.count - a.count || b.status - a.status);
}

async function clickFirstMatching(page, selectors, step, log) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();
    if (count === 0) continue;
    try {
      await locator.click({ timeout: 4000 });
      log.push({ step, selector, ok: true });
      return true;
    } catch (error) {
      log.push({ step, selector, ok: false, reason: error instanceof Error ? error.message : "click failed" });
    }
  }
  log.push({ step, ok: false, reason: "no matching selector" });
  return false;
}

async function run() {
  await ensureDir(outputDir);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    isMobile: false,
    hasTouch: false
  });
  const page = await context.newPage();
  const stepLog = [];
  const apiEvents = [];
  const requestStartByKey = new Map();

  page.on("request", (request) => {
    const path = normalizeApiPath(request.url());
    if (!path) return;
    const key = `${request.method()} ${request.url()}`;
    requestStartByKey.set(key, Date.now());
  });

  page.on("response", (response) => {
    const path = normalizeApiPath(response.url());
    if (!path) return;
    const request = response.request();
    const key = `${request.method()} ${request.url()}`;
    const startedAt = requestStartByKey.get(key) ?? Date.now();
    apiEvents.push({
      at: new Date().toISOString(),
      method: request.method(),
      path,
      status: response.status(),
      duration_ms: Date.now() - startedAt
    });
  });

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".table-loading-overlay", { state: "hidden", timeout: 20000 }).catch(() => undefined);
    await page.waitForSelector(".posui-product-card, .pos-product-card", { state: "visible", timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outputDir, "step-01-initial.png"), fullPage: true });

    await clickFirstMatching(page, ["button:has-text('กลับบ้าน')", "button:has-text('Takeaway')"], "switch_takeaway", stepLog);
    await page.waitForTimeout(500);

    await clickFirstMatching(
      page,
      [".posui-product-card button", ".posui-product-card", ".pos-product-card button", ".pos-product-card"],
      "add_first_product",
      stepLog
    );
    await page.waitForTimeout(450);

    await clickFirstMatching(
      page,
      [
        "button:has-text('สร้างออเดอร์ POS')",
        "button:has-text('Create POS order')",
        "button:has-text('ชำระเงิน')",
        "button:has-text('Pay')"
      ],
      "checkout_submit",
      stepLog
    );
    await page.waitForTimeout(1500);
    await clickFirstMatching(
      page,
      ["button:has-text('ปิด')", "button:has-text('Close')", ".posui-btn--review-close", ".posui-payment-modal__close"],
      "close_payment_modal",
      stepLog
    );
    await page.waitForTimeout(600);

    await clickFirstMatching(page, ["button:has-text('นั่งโต๊ะ')", "button:has-text('Dine-in')"], "switch_dine_in", stepLog);
    await page.waitForTimeout(900);
    await clickFirstMatching(page, [".posui-table-card", ".table-card", "[data-table-card]"], "select_table", stepLog);
    await page.waitForTimeout(900);

    await clickFirstMatching(page, ["button:has-text('เดลิเวอรี่')", "button:has-text('Delivery')"], "switch_delivery", stepLog);
    await page.waitForTimeout(900);
    await clickFirstMatching(
      page,
      ["button:has-text('ไลน์แมน')", "button:has-text('Line Man')", "button:has-text('Grab')", "button:has-text('Shopee')"],
      "open_delivery_popup",
      stepLog
    );
    await page.waitForTimeout(1600);

    await page.screenshot({ path: path.join(outputDir, "step-02-after-flow.png"), fullPage: true });
  } finally {
    await context.close();
    await browser.close();
  }

  const statusSummary = summarizeApiEvents(apiEvents);
  const total4xx = apiEvents.filter((entry) => entry.status >= 400 && entry.status < 500).length;
  const total409 = apiEvents.filter((entry) => entry.status === 409).length;
  const total5xx = apiEvents.filter((entry) => entry.status >= 500).length;

  const report = {
    url: targetUrl,
    generatedAt: new Date().toISOString(),
    steps: stepLog,
    totals: {
      api_calls: apiEvents.length,
      status_4xx: total4xx,
      status_409: total409,
      status_5xx: total5xx
    },
    statusSummary,
    apiEvents
  };

  const reportPath = path.join(outputDir, "results.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Saved POS flow UAT report to ${reportPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
