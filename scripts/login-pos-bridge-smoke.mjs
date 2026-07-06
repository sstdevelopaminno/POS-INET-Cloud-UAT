import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const loginBaseUrl = process.env.POS_LOGIN_URL ?? "http://localhost:3000/login/store";
const posBaseUrl = process.env.POS_PREVIEW_URL ?? "http://localhost:3000/preview/pos";
const storeCode = String(process.env.POS_SMOKE_STORE_CODE ?? "").trim().toUpperCase();
const employeeCode = String(process.env.POS_SMOKE_EMPLOYEE_CODE ?? "").trim().toUpperCase();
const preferredBranch = String(process.env.POS_SMOKE_BRANCH_NAME ?? "").trim();
const preferredDevice = String(process.env.POS_SMOKE_DEVICE_CODE ?? "").trim().toUpperCase();
const outputDir = path.resolve("docs/qa-screenshots/login-pos-bridge");

function requiredOrThrow(value, envKey) {
  if (!value) {
    throw new Error(`Missing required env ${envKey}.`);
  }
  return value;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitForRoute(page, routes, timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = page.url();
    if (routes.some((route) => current.includes(route))) {
      return current;
    }
    await page.waitForTimeout(150);
  }
  throw new Error(`Timeout waiting for routes: ${routes.join(", ")}; current=${page.url()}`);
}

async function waitForEnabledButton(page, selector = "button[type='submit']", timeoutMs = 30000) {
  const target = page.locator(selector).first();
  await target.waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForFunction(
    (resolvedSelector) => {
      const element = document.querySelector(resolvedSelector);
      return element instanceof HTMLButtonElement ? !element.disabled : false;
    },
    selector,
    { timeout: timeoutMs }
  );
}

async function run() {
  requiredOrThrow(storeCode, "POS_SMOKE_STORE_CODE");
  requiredOrThrow(employeeCode, "POS_SMOKE_EMPLOYEE_CODE");

  await ensureDir(outputDir);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 }
  });
  const page = await context.newPage();

  const report = {
    generatedAt: new Date().toISOString(),
    loginBaseUrl,
    posBaseUrl,
    storeCode,
    preferredBranch,
    preferredDevice,
    steps: [],
    result: "failed",
    errors: []
  };

  const recordStep = (name, detail = {}) => {
    report.steps.push({ at: new Date().toISOString(), name, ...detail });
  };

  try {
    await page.goto(loginBaseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    recordStep("open_login_store", { ok: true });
    await page.screenshot({ path: path.join(outputDir, "01-login-store.png"), fullPage: true });

    await page.fill("#storeCode", storeCode);
    await waitForEnabledButton(page, "button[type='submit']", 60000);
    const storeVerifyResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/auth/store-code/verify") && response.request().method() === "POST",
      { timeout: 90000 }
    );
    await page.click("button[type='submit']");
    const storeVerifyResponse = await storeVerifyResponsePromise;
    recordStep("api_store_verify", { ok: storeVerifyResponse.ok(), status: storeVerifyResponse.status() });
    recordStep("submit_store_code", { ok: true });

    const currentAfterStore = await waitForRoute(page, ["/login/branches", "/login/employee"]);
    if (currentAfterStore.includes("/login/branches")) {
      recordStep("branch_step_detected", { ok: true });
      if (preferredBranch) {
        const branchButton = page.locator("button.ipos-branch-card", { hasText: preferredBranch }).first();
        const count = await branchButton.count();
        if (count > 0) {
          await branchButton.click();
          recordStep("select_preferred_branch", { ok: true, preferredBranch });
        } else {
          recordStep("select_preferred_branch", { ok: false, reason: "not_found", preferredBranch });
        }
      } else {
        const firstBranch = page.locator("button.ipos-branch-card").first();
        if ((await firstBranch.count()) > 0) {
          await firstBranch.click();
          recordStep("select_first_branch", { ok: true });
        }
      }
      const branchSelectResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/auth/branches/select") && response.request().method() === "POST",
        { timeout: 90000 }
      );
      await waitForEnabledButton(page, "button.ipos-primary-btn", 60000);
      await page.click("button.ipos-primary-btn");
      const branchSelectResponse = await branchSelectResponsePromise;
      await page.waitForURL("**/login/employee**", { timeout: 90000 });
      recordStep("confirm_branch_selection", { ok: branchSelectResponse.ok(), status: branchSelectResponse.status() });
      await page.screenshot({ path: path.join(outputDir, "02-login-branches.png"), fullPage: true });
    } else {
      recordStep("branch_step_skipped", { ok: true, url: currentAfterStore });
    }

    await page.waitForURL("**/login/employee**", { timeout: 30000 });
    await page.fill("#employeeCode", employeeCode);
    await waitForEnabledButton(page, "button[type='submit']", 60000);
    const employeeVerifyResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/auth/employee/verify-code") && response.request().method() === "POST",
      { timeout: 90000 }
    );
    await page.click("button[type='submit']");
    const employeeVerifyResponse = await employeeVerifyResponsePromise;
    await page.waitForURL("**/login/devices**", { timeout: 90000 });
    recordStep("employee_verified_via_code", { ok: employeeVerifyResponse.ok(), status: employeeVerifyResponse.status(), employeeCode });
    await page.screenshot({ path: path.join(outputDir, "03-login-employee.png"), fullPage: true });

    if (page.url().includes("/login/devices") && preferredDevice) {
      const preferredDeviceCard = page.locator("button.ipos-device-card", { hasText: preferredDevice }).first();
      const deviceFound = await preferredDeviceCard.count();
      if (deviceFound > 0) {
        await preferredDeviceCard.click();
        recordStep("select_preferred_device", { ok: true, preferredDevice });
      } else {
        recordStep("select_preferred_device", { ok: false, reason: "not_found", preferredDevice });
      }
    }

    if (page.url().includes("/login/devices") && !preferredDevice) {
      const firstDeviceCard = page.locator("button.ipos-device-card").first();
      if ((await firstDeviceCard.count()) > 0) {
        await firstDeviceCard.click();
        recordStep("select_first_device", { ok: true });
      }
    }

    if (page.url().includes("/login/devices")) {
      const deviceSelectResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/auth/devices/select") && response.request().method() === "POST",
        { timeout: 90000 }
      );
      await waitForEnabledButton(page, "button.ipos-primary-btn", 60000);
      await page.click("button.ipos-primary-btn");
      const deviceSelectResponse = await deviceSelectResponsePromise;
      recordStep("api_device_select", { ok: deviceSelectResponse.ok(), status: deviceSelectResponse.status() });
      await page.waitForURL("**/preview/pos**", { timeout: 120000 });
    }
    recordStep("redirect_to_pos_preview", { ok: true, url: page.url() });
    await page.screenshot({ path: path.join(outputDir, "04-pos-preview.png"), fullPage: true });

    const sessionResponse = await context.request.get("http://localhost:3000/api/pos/session/current", { timeout: 120000 });
    const sessionBody = await sessionResponse.json().catch(() => null);
    recordStep("api_session_current", { ok: sessionResponse.ok(), status: sessionResponse.status() });

    report.result = sessionResponse.ok() ? "passed" : "failed";
    if (!sessionResponse.ok()) {
      report.errors.push({
        step: "api_session_current",
        status: sessionResponse.status(),
        body: sessionBody
      });
    }
  } catch (error) {
    report.errors.push({
      step: "runtime",
      message: error instanceof Error ? error.message : String(error)
    });
    await page.screenshot({ path: path.join(outputDir, "99-error.png"), fullPage: true }).catch(() => undefined);
  } finally {
    const reportPath = path.join(outputDir, "results.json");
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    await context.close();
    await browser.close();
    console.log(`Saved login bridge smoke report to ${reportPath}`);
    if (report.result !== "passed") {
      process.exitCode = 1;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
