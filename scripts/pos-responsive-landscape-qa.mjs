import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const POS_URL = process.env.POS_UI_QA_URL ?? "http://localhost:3000/preview/pos";
const ORIGIN = new URL(POS_URL).origin;
const STORE_CODE = String(process.env.POS_SMOKE_STORE_CODE ?? "NDL-TH-001").trim().toUpperCase();
const EMPLOYEE_CODE = String(process.env.POS_OWNER_EMPLOYEE_CODE ?? "182536").trim().toUpperCase();
const OUT_DIR = path.resolve("docs/qa-screenshots/pos-responsive-landscape");

const viewports = [
  { key: "tablet-1024x768", width: 1024, height: 768, isMobile: true, hasTouch: true, expectGuard: false },
  { key: "ipad-1180x820", width: 1180, height: 820, isMobile: true, hasTouch: true, expectGuard: false },
  { key: "ipad-1194x834", width: 1194, height: 834, isMobile: true, hasTouch: true, expectGuard: false },
  { key: "ipad-pro-1366x1024", width: 1366, height: 1024, isMobile: true, hasTouch: true, expectGuard: false },
  { key: "laptop-1280x720", width: 1280, height: 720, isMobile: false, hasTouch: false, expectGuard: false },
  { key: "laptop-1366x768", width: 1366, height: 768, isMobile: false, hasTouch: false, expectGuard: false },
  { key: "desktop-1440x900", width: 1440, height: 900, isMobile: false, hasTouch: false, expectGuard: false },
  { key: "desktop-1536x864", width: 1536, height: 864, isMobile: false, hasTouch: false, expectGuard: false },
  { key: "desktop-1600x900", width: 1600, height: 900, isMobile: false, hasTouch: false, expectGuard: false },
  { key: "desktop-1920x1080", width: 1920, height: 1080, isMobile: false, hasTouch: false, expectGuard: false },
  { key: "large-2560x1440", width: 2560, height: 1440, isMobile: false, hasTouch: false, expectGuard: false },
  { key: "mobile-390x844", width: 390, height: 844, isMobile: true, hasTouch: true, expectGuard: true },
  { key: "mobile-430x932", width: 430, height: 932, isMobile: true, hasTouch: true, expectGuard: true },
  { key: "tablet-portrait-768x1024", width: 768, height: 1024, isMobile: true, hasTouch: true, expectGuard: true },
  { key: "narrow-767x900", width: 767, height: 900, isMobile: false, hasTouch: false, expectGuard: true }
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function requestJson(request, method, url, data) {
  const response = method === "POST" ? await request.post(url, { data, timeout: 120000 }) : await request.get(url, { timeout: 120000 });
  const body = await response.json().catch(() => null);
  if (!response.ok()) {
    throw new Error(`${method} ${url} failed status=${response.status()} body=${JSON.stringify(body)}`);
  }
  return body;
}

async function login(page) {
  await requestJson(page.request, "POST", `${ORIGIN}/api/auth/store-code/verify`, { store_code: STORE_CODE });
  const branches = await requestJson(page.request, "GET", `${ORIGIN}/api/auth/branches`);
  const firstBranch = Array.isArray(branches?.data?.branches) ? branches.data.branches[0] : null;
  if (firstBranch?.id) {
    await requestJson(page.request, "POST", `${ORIGIN}/api/auth/branches/select`, { branch_id: firstBranch.id });
  }
  await requestJson(page.request, "POST", `${ORIGIN}/api/auth/employee/verify-code`, { employee_code: EMPLOYEE_CODE });
  const devices = await requestJson(page.request, "GET", `${ORIGIN}/api/auth/devices`);
  const deviceList = Array.isArray(devices?.data?.devices) ? devices.data.devices : [];
  const canOverride = Boolean(devices?.data?.can_override_in_use);
  const device =
    deviceList.find((item) => item?.status === "ready") ??
    (canOverride ? deviceList.find((item) => item?.status === "in_use") : null) ??
    deviceList.find((item) => item?.status !== "offline" && item?.status !== "disabled");
  if (!device?.deviceCode) {
    throw new Error(`No eligible POS device. statuses=${deviceList.map((item) => `${item.deviceCode}:${item.status}`).join(",")}`);
  }
  await requestJson(page.request, "POST", `${ORIGIN}/api/auth/devices/select`, {
    device_code: device.deviceCode,
    force_override: device.status === "in_use"
  });
}

async function ensureShift(request) {
  const current = await requestJson(request, "GET", `${ORIGIN}/api/pos/shifts/current`);
  if (current?.data?.current_shift?.id) return;
  const openShifts = Array.isArray(current?.data?.available_open_shifts) ? current.data.available_open_shifts : [];
  if (openShifts[0]?.id) {
    await requestJson(request, "POST", `${ORIGIN}/api/pos/shifts/join`, { shift_id: openShifts[0].id });
    return;
  }
  await requestJson(request, "POST", `${ORIGIN}/api/pos/shifts/open`, { opening_cash: 0 });
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const guard = document.querySelector(".pos-viewport-guard");
    const posRoot = document.querySelector(".pos-app-root");
    const posShell = document.querySelector(".posui-shell");
    const overflowPx = Math.max(0, Math.ceil(root.scrollWidth - window.innerWidth));
    const visibleElements = Array.from(document.querySelectorAll("button,[role='button'],input,select,textarea,a[href]")).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    const smallTargets = visibleElements
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 42),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      })
      .filter((item) => item.width < 40 || item.height < 40);
    const cart = document.querySelector(".posui-cart-panel");
    const cartRect = cart?.getBoundingClientRect();
    return {
      url: window.location.href,
      title: document.title,
      posRootPresent: Boolean(posRoot),
      posShellPresent: Boolean(posShell),
      guardVisible: Boolean(guard),
      overflowPx,
      hasHorizontalOverflow: overflowPx > 1,
      interactiveCount: visibleElements.length,
      smallTargetCount: smallTargets.length,
      smallTargetSamples: smallTargets.slice(0, 8),
      cartVisible:
        cartRect != null
          ? cartRect.width > 0 && cartRect.height > 0 && cartRect.left >= 0 && cartRect.right <= window.innerWidth
          : false
    };
  });
}

async function run() {
  await ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const report = { generatedAt: new Date().toISOString(), posUrl: POS_URL, results: [] };

  try {
    const loginContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const loginPage = await loginContext.newPage();
    await login(loginPage);
    await ensureShift(loginContext.request);
    const state = await loginContext.storageState();
    await loginContext.close();

    for (const viewport of viewports) {
      const context = await browser.newContext({
        storageState: state,
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        deviceScaleFactor: viewport.isMobile ? 2 : 1
      });
      const page = await context.newPage();
      const startedAt = Date.now();
      await page.goto(POS_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(1400);
      if (viewport.expectGuard) {
        await page.locator(".pos-viewport-guard").waitFor({ state: "visible", timeout: 10000 }).catch(() => null);
      } else {
        await page.locator(".posui-shell").waitFor({ state: "visible", timeout: 45000 }).catch(() => null);
      }
      const loadMs = Date.now() - startedAt;
      const metrics = await collectMetrics(page);

      const salesSummaryLink = page.locator("aside a[href='/preview/pos/sales-summary']").first();
      let navigationMs = null;
      let navigationError = null;
      if (!metrics.guardVisible && (await salesSummaryLink.count()) > 0) {
        const navStartedAt = Date.now();
        await page.locator(".table-loading-overlay").waitFor({ state: "hidden", timeout: 10000 }).catch(() => null);
        try {
          await salesSummaryLink.click({ timeout: 8000 }).catch(async () => {
            await page.goto(`${ORIGIN}/preview/pos/sales-summary`, { waitUntil: "domcontentloaded", timeout: 90000 });
          });
          await page.waitForURL("**/preview/pos/sales-summary", { timeout: 45000 });
          await page.waitForTimeout(800);
        } catch (error) {
          navigationError = error instanceof Error ? error.message : String(error);
        }
        navigationMs = Date.now() - navStartedAt;
      }

      const screenshotPath = path.join(OUT_DIR, `${viewport.key}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      report.results.push({
        viewport,
        loadMs,
        navigationMs,
        navigationError,
        screenshot: path.relative(path.resolve("."), screenshotPath).replaceAll("\\", "/"),
        metrics,
        pass: metrics.guardVisible === viewport.expectGuard && !metrics.hasHorizontalOverflow && (viewport.expectGuard || metrics.posShellPresent)
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(OUT_DIR, "results.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Saved POS responsive report to ${reportPath}`);

  const failed = report.results.filter((item) => !item.pass);
  if (failed.length > 0) {
    console.error(`Failed viewports: ${failed.map((item) => item.viewport.key).join(", ")}`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
