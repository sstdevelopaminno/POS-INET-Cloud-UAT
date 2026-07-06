import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const loginBaseUrl = process.env.POS_LOGIN_URL ?? "http://localhost:3000/login/store";
const posPreviewUrl = process.env.POS_PREVIEW_URL ?? "http://localhost:3000/preview/pos";
const loginApiOrigin = new URL(loginBaseUrl).origin;
const posApiOrigin = new URL(posPreviewUrl).origin;
const posTargetPath = new URL(posPreviewUrl).pathname;
const storeCode = String(process.env.POS_SMOKE_STORE_CODE ?? "").trim().toUpperCase();
const employeeCode = String(process.env.POS_SMOKE_EMPLOYEE_CODE ?? "").trim().toUpperCase();
const preferredBranch = String(process.env.POS_SMOKE_BRANCH_NAME ?? "").trim();
const preferredDevice = String(process.env.POS_SMOKE_DEVICE_CODE ?? "").trim().toUpperCase();
const headless = String(process.env.POS_SMOKE_HEADLESS ?? "1").trim() !== "0";
const outputDir = path.resolve("docs/qa-screenshots/login-pos-e2e-smoke");
const API_TIMEOUT_MS = Number(process.env.POS_SMOKE_API_TIMEOUT_MS ?? 120000);
const ROUTE_TIMEOUT_MS = Number(process.env.POS_SMOKE_ROUTE_TIMEOUT_MS ?? 90000);

const SESSION_EXPIRED_CODES = new Set([
  "missing_pos_session",
  "invalid_handoff_token",
  "session_not_found",
  "session_not_active",
  "session_expired",
  "session_claim_mismatch",
  "session_user_inactive",
  "session_tenant_inactive"
]);

function requiredOrThrow(value, envKey) {
  if (!value) {
    throw new Error(`Missing required env ${envKey}.`);
  }
  return value;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitForRoute(page, routes, timeoutMs = 25000) {
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

async function safeJson(response) {
  return response.json().catch(() => null);
}

function isRetryableApiRequestError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("ECONNRESET") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("Timeout") ||
    message.includes("socket hang up") ||
    message.includes("Target page, context or browser has been closed")
  );
}

async function apiRequestWithRetry(requestContext, method, url, options = {}, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestContext[method](url, { timeout: API_TIMEOUT_MS, ...options });
    } catch (error) {
      lastError = error;
      if (!isRetryableApiRequestError(error) || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError ?? new Error(`Failed to ${method.toUpperCase()} ${url}`);
}

async function warmupLoginApi(context, report) {
  const warmupResponse = await apiRequestWithRetry(context.request, "post", `${loginApiOrigin}/api/auth/store-code/verify`, {
    failOnStatusCode: false,
    data: {}
  });
  const warmupOk = warmupResponse.status() < 500;
  report.scenarios.push({
    name: "warmup",
    result: warmupOk ? "passed" : "failed",
    steps: [
      {
        at: new Date().toISOString(),
        name: "api_store_verify_warmup",
        ok: warmupOk,
        status: warmupResponse.status()
      }
    ],
    errors: warmupOk
      ? []
      : [{ step: "api_store_verify_warmup", message: `Unexpected status ${warmupResponse.status()} while warming login API.` }]
  });
}

function makeScenarioReport(name) {
  return {
    name,
    result: "failed",
    steps: [],
    errors: []
  };
}

function addStep(scenario, name, detail = {}) {
  scenario.steps.push({
    at: new Date().toISOString(),
    name,
    ...detail
  });
}

function resolveBrowserUrl(value, origin = loginApiOrigin) {
  return new URL(value, origin).toString();
}

async function captureScreenshot(page, scenario, fileName) {
  const screenshotPath = path.join(outputDir, fileName);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 90000 });
    addStep(scenario, "screenshot", { ok: true, file: fileName });
  } catch (error) {
    addStep(scenario, "screenshot", {
      ok: false,
      file: fileName,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function waitForPosSalesReady(page, scenario, timeoutMs = Number(process.env.POS_SMOKE_SALES_READY_TIMEOUT_MS ?? 150000)) {
  const startedAt = Date.now();
  await page.waitForFunction(
    () => {
      const runtimeReady = Boolean(globalThis.__posVerification?.source === "PosSalesModule");
      const loadingOverlayGone = document.querySelector(".table-loading-overlay") === null;
      const salesControlsReady =
        document.querySelector(".posui-product-card") !== null ||
        document.querySelector(".posui-btn--checkout") !== null ||
        document.body.innerText.includes("Create POS order");
      return loadingOverlayGone && (runtimeReady || salesControlsReady);
    },
    undefined,
    { timeout: timeoutMs, polling: 500 }
  );
  addStep(scenario, "pos_sales_ready", { ok: true, elapsedMs: Date.now() - startedAt });
}

async function loginStoreBranchEmployeeDevice(page, scenario) {
  await page.goto(loginBaseUrl, { waitUntil: "networkidle", timeout: 60000 });
  addStep(scenario, "open_login_store", { ok: true, url: page.url() });
  await captureScreenshot(page, scenario, "01-login-store.png");

  await page.locator("#storeCode").waitFor({ state: "visible", timeout: 90000 });
  await page.fill("#storeCode", storeCode);
  await waitForEnabledButton(page, "button[type='submit']", 90000);
  const storeVerifyResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/store-code/verify") && response.request().method() === "POST",
    { timeout: 90000 }
  );
  await page.click("button[type='submit']");
  const storeVerifyResponse = await storeVerifyResponsePromise;
  addStep(scenario, "api_store_verify", { ok: storeVerifyResponse.ok(), status: storeVerifyResponse.status() });
  addStep(scenario, "submit_store_code", { ok: true, storeCode });

  const routeAfterStore = await waitForRoute(page, ["/login/branches", "/login/employee"], 90000);
  if (routeAfterStore.includes("/login/branches")) {
    addStep(scenario, "branch_step_detected", { ok: true });
    if (preferredBranch) {
      const preferredBranchButton = page.locator("button.ipos-branch-card", { hasText: preferredBranch }).first();
      if ((await preferredBranchButton.count()) > 0) {
        await preferredBranchButton.click();
        addStep(scenario, "select_preferred_branch", { ok: true, preferredBranch });
      } else {
        addStep(scenario, "select_preferred_branch", { ok: false, preferredBranch, reason: "not_found" });
      }
    } else {
      const firstBranch = page.locator("button.ipos-branch-card").first();
      if ((await firstBranch.count()) > 0) {
        await firstBranch.click();
        addStep(scenario, "select_first_branch", { ok: true });
      }
    }

    await page.click("button.ipos-primary-btn");
    await waitForRoute(page, ["/login/employee"], ROUTE_TIMEOUT_MS);
    addStep(scenario, "confirm_branch_selection", { ok: true });
    await captureScreenshot(page, scenario, "02-login-branches.png");
  } else {
    addStep(scenario, "branch_step_skipped", { ok: true, url: routeAfterStore });
  }

  await waitForRoute(page, ["/login/employee"], ROUTE_TIMEOUT_MS);
  await page.locator("#employeeCode").waitFor({ state: "visible", timeout: 90000 });
  await page.fill("#employeeCode", employeeCode);
  await waitForEnabledButton(page, "button[type='submit']", 90000);
  const employeeVerifyResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/employee/verify-code") && response.request().method() === "POST",
    { timeout: 90000 }
  );
  await page.click("button[type='submit']");
  const employeeVerifyResponse = await employeeVerifyResponsePromise;
  addStep(scenario, "api_employee_verify", {
    ok: employeeVerifyResponse.ok(),
    status: employeeVerifyResponse.status()
  });
  if (!employeeVerifyResponse.ok()) {
    const employeeVerifyBody = await safeJson(employeeVerifyResponse);
    throw new Error(`employee verify failed: ${JSON.stringify(employeeVerifyBody)}`);
  }
  addStep(scenario, "employee_verified_via_code", { ok: true, employeeCode });
  await captureScreenshot(page, scenario, "03-login-employee.png");
  await waitForRoute(page, ["/login/devices"], ROUTE_TIMEOUT_MS);

  const devicesApiResponse = await apiRequestWithRetry(page.request, "get", `${loginApiOrigin}/api/auth/devices`);
  const devicesApiBody = await safeJson(devicesApiResponse);
  const deviceItems = Array.isArray(devicesApiBody?.data?.devices) ? devicesApiBody.data.devices : [];
  const canOverrideInUse = Boolean(devicesApiBody?.data?.can_override_in_use);
  addStep(scenario, "api_devices_after_employee_success", {
    ok: devicesApiResponse.ok(),
    status: devicesApiResponse.status(),
    deviceCount: deviceItems.length
  });

  if (devicesApiResponse.ok() && deviceItems.length > 0) {
    const preferred = preferredDevice ? deviceItems.find((item) => String(item?.deviceCode ?? "").toUpperCase() === preferredDevice) : null;
    const selectedDevice =
      preferred ??
      deviceItems.find((item) => item.status === "ready") ??
      (canOverrideInUse ? deviceItems.find((item) => item.status === "in_use") : null) ??
      deviceItems.find((item) => item.status !== "offline" && item.status !== "disabled") ??
      null;

    if (selectedDevice?.deviceCode) {
      const selectResponse = await apiRequestWithRetry(page.request, "post", `${loginApiOrigin}/api/auth/devices/select`, {
        data: {
          device_code: selectedDevice.deviceCode,
          force_override: selectedDevice.status === "in_use"
        }
      });
      const selectBody = await safeJson(selectResponse);
      addStep(scenario, "api_device_select_after_employee_success", {
        ok: selectResponse.ok(),
        status: selectResponse.status(),
        deviceCode: selectedDevice.deviceCode
      });

      if (selectResponse.ok() && selectBody?.data?.redirect_to) {
        await page.goto(resolveBrowserUrl(selectBody.data.redirect_to, posApiOrigin), { waitUntil: "domcontentloaded", timeout: 120000 });
        await waitForRoute(page, [posTargetPath], 120000);
        addStep(scenario, "redirect_to_pos_preview", { ok: true, url: page.url() });
        await captureScreenshot(page, scenario, "04-pos-preview-gate.png");
        return;
      }
    }
  }

  await waitForEnabledButton(page, "button.ipos-primary-btn", 90000);
  await page.click("button.ipos-primary-btn");
  const routeAfterSuccess = await waitForRoute(page, ["/login/devices", posTargetPath], 120000);
  addStep(scenario, "employee_success_continue_ui_fallback", { ok: true, url: routeAfterSuccess });
  if (routeAfterSuccess.includes(posTargetPath)) {
    addStep(scenario, "redirect_to_pos_preview", { ok: true, url: page.url() });
    await captureScreenshot(page, scenario, "04-pos-preview-gate.png");
    return;
  }

  if (preferredDevice) {
    const preferredDeviceCard = page.locator("button.ipos-device-card", { hasText: preferredDevice }).first();
    if ((await preferredDeviceCard.count()) > 0) {
      await preferredDeviceCard.click();
      addStep(scenario, "select_preferred_device", { ok: true, preferredDevice });
    } else {
      addStep(scenario, "select_preferred_device", { ok: false, preferredDevice, reason: "not_found" });
    }
  } else {
    const firstDeviceCard = page.locator("button.ipos-device-card").first();
    if ((await firstDeviceCard.count()) > 0) {
      await firstDeviceCard.click();
      addStep(scenario, "select_first_device", { ok: true });
    }
  }

  await waitForEnabledButton(page, "button.ipos-primary-btn", 90000);
  await page.click("button.ipos-primary-btn");
  await waitForRoute(page, [posTargetPath], 120000);
  addStep(scenario, "redirect_to_pos_preview", { ok: true, url: page.url() });
  await captureScreenshot(page, scenario, "04-pos-preview-gate.png");
}

async function ensureShiftAndSalesAccess(context, page, scenario) {
  const sessionResponse = await apiRequestWithRetry(context.request, "get", `${posApiOrigin}/api/pos/session/current`);
  const sessionBody = await safeJson(sessionResponse);
  addStep(scenario, "api_session_current", { ok: sessionResponse.ok(), status: sessionResponse.status() });
  if (!sessionResponse.ok()) {
    throw new Error(`session_current failed: ${JSON.stringify(sessionBody)}`);
  }

  let shiftResponse = await apiRequestWithRetry(context.request, "get", `${posApiOrigin}/api/pos/shifts/current`);
  let shiftBody = await safeJson(shiftResponse);
  addStep(scenario, "api_shift_current_initial", { ok: shiftResponse.ok(), status: shiftResponse.status() });
  if (!shiftResponse.ok()) {
    throw new Error(`shifts_current failed: ${JSON.stringify(shiftBody)}`);
  }

  let currentShift = shiftBody?.data?.current_shift ?? null;
  const openShifts = Array.isArray(shiftBody?.data?.available_open_shifts) ? shiftBody.data.available_open_shifts : [];
  const sessionHasActiveShift = Boolean(sessionBody?.data?.has_active_shift && sessionBody?.data?.shift?.status === "open");

  if (!sessionHasActiveShift) {
    if (openShifts.length > 0) {
      const joinTarget =
        (preferredDevice ? openShifts.find((item) => String(item?.device_code ?? "").toUpperCase() === preferredDevice) : null) ?? openShifts[0];
      const joinResponse = await apiRequestWithRetry(context.request, "post", `${posApiOrigin}/api/pos/shifts/join`, {
        data: { shift_id: joinTarget.id }
      });
      const joinBody = await safeJson(joinResponse);
      addStep(scenario, "api_shift_join", {
        ok: joinResponse.ok(),
        status: joinResponse.status(),
        shiftId: joinTarget.id,
        deviceCode: joinTarget.device_code ?? null
      });
      if (!joinResponse.ok()) {
        throw new Error(`shift_join failed: ${JSON.stringify(joinBody)}`);
      }
    } else {
      const openResponse = await apiRequestWithRetry(context.request, "post", `${posApiOrigin}/api/pos/shifts/open`, {
        data: { opening_cash: 0 }
      });
      const openBody = await safeJson(openResponse);
      addStep(scenario, "api_shift_open", { ok: openResponse.ok(), status: openResponse.status() });
      if (!openResponse.ok()) {
        throw new Error(`shift_open failed: ${JSON.stringify(openBody)}`);
      }
    }

    shiftResponse = await apiRequestWithRetry(context.request, "get", `${posApiOrigin}/api/pos/shifts/current`);
    shiftBody = await safeJson(shiftResponse);
    addStep(scenario, "api_shift_current_after_action", { ok: shiftResponse.ok(), status: shiftResponse.status() });
    if (!shiftResponse.ok()) {
      throw new Error(`shifts_current(after_action) failed: ${JSON.stringify(shiftBody)}`);
    }
    currentShift = shiftBody?.data?.current_shift ?? null;
    if (!currentShift) {
      throw new Error("No active shift after open/join action.");
    }
  }

  await page.goto(posPreviewUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForPosSalesReady(page, scenario);
  await captureScreenshot(page, scenario, "05-pos-sales-ready.png");

  const productsResponse = await apiRequestWithRetry(context.request, "get", `${posApiOrigin}/api/pos/products`);
  let productsBody = await safeJson(productsResponse);
  let productsOk = productsResponse.ok();
  let productsStatus = productsResponse.status();
  let productCount = Array.isArray(productsBody?.data?.products) ? productsBody.data.products.length : 0;

  if (!productsOk && productsBody?.error?.code === "missing_active_shift") {
    const openResponse = await apiRequestWithRetry(context.request, "post", `${posApiOrigin}/api/pos/shifts/open`, {
      data: { opening_cash: 0 }
    });
    const openBody = await safeJson(openResponse);
    addStep(scenario, "api_shift_open_on_products_guard", {
      ok: openResponse.ok(),
      status: openResponse.status()
    });

    if (openResponse.ok()) {
      const retryResponse = await apiRequestWithRetry(context.request, "get", `${posApiOrigin}/api/pos/products`);
      productsBody = await safeJson(retryResponse);
      productsOk = retryResponse.ok();
      productsStatus = retryResponse.status();
      productCount = Array.isArray(productsBody?.data?.products) ? productsBody.data.products.length : 0;
    } else {
      throw new Error(`shift_open (products guard) failed: ${JSON.stringify(openBody)}`);
    }
  }

  addStep(scenario, "api_products", {
    ok: productsOk,
    status: productsStatus,
    productCount
  });
  if (!productsOk) {
    throw new Error(`products failed: ${JSON.stringify(productsBody)}`);
  }
}

async function runHappyPath(context, page, report) {
  const scenario = makeScenarioReport("happy_path");
  report.scenarios.push(scenario);
  try {
    await loginStoreBranchEmployeeDevice(page, scenario);
    await ensureShiftAndSalesAccess(context, page, scenario);
    scenario.result = "passed";
  } catch (error) {
    scenario.errors.push({
      step: "runtime",
      message: error instanceof Error ? error.message : String(error)
    });
    await captureScreenshot(page, scenario, "99-happy-path-error.png");
    throw error;
  }
}

async function runSessionExpiredPath(context, page, report) {
  const scenario = makeScenarioReport("session_expired_path");
  report.scenarios.push(scenario);

  try {
    await context.clearCookies();
    addStep(scenario, "clear_cookies", { ok: true });

    await page.goto(posPreviewUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(900);
    addStep(scenario, "open_pos_after_cookie_clear", { ok: true, url: page.url() });

    const sessionResponse = await apiRequestWithRetry(context.request, "get", `${posApiOrigin}/api/pos/session/current`);
    const sessionBody = await safeJson(sessionResponse);
    const sessionCode = String(sessionBody?.error?.code ?? "");
    const expectedSessionExpired = !sessionResponse.ok() && SESSION_EXPIRED_CODES.has(sessionCode);
    addStep(scenario, "api_session_current_after_expire", {
      ok: expectedSessionExpired,
      status: sessionResponse.status(),
      code: sessionCode
    });
    if (!expectedSessionExpired) {
      throw new Error(`Expected session-expired style response but got: ${JSON.stringify(sessionBody)}`);
    }

    const productsResponse = await apiRequestWithRetry(context.request, "get", `${posApiOrigin}/api/pos/products`);
    const productsBody = await safeJson(productsResponse);
    const productsBlocked = !productsResponse.ok();
    addStep(scenario, "api_products_after_expire", {
      ok: productsBlocked,
      status: productsResponse.status(),
      code: productsBody?.error?.code ?? null
    });
    if (!productsBlocked) {
      throw new Error(`Expected /api/pos/products to be blocked but got: ${JSON.stringify(productsBody)}`);
    }

    const productsAfterExpire = page.locator(".posui-product-card, .pos-product-card");
    const productsVisibleCount = await productsAfterExpire.count();
    const uiBlocked = productsVisibleCount === 0;
    addStep(scenario, "ui_gate_blocks_access", { ok: uiBlocked, productsVisibleCount });
    if (!uiBlocked) {
      throw new Error("POS UI still rendered product cards after session expired.");
    }

    await captureScreenshot(page, scenario, "06-session-expired-gate.png");
    scenario.result = "passed";
  } catch (error) {
    scenario.errors.push({
      step: "runtime",
      message: error instanceof Error ? error.message : String(error)
    });
    await captureScreenshot(page, scenario, "98-session-expired-error.png");
    throw error;
  }
}

async function run() {
  requiredOrThrow(storeCode, "POS_SMOKE_STORE_CODE");
  requiredOrThrow(employeeCode, "POS_SMOKE_EMPLOYEE_CODE");

  await ensureDir(outputDir);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 }
  });
  const page = await context.newPage();

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      loginBaseUrl,
      posPreviewUrl,
      storeCode,
      employeeCode,
      preferredBranch,
      preferredDevice,
      headless
    },
    scenarios: [],
    result: "failed",
    errors: []
  };

  try {
    await warmupLoginApi(context, report);
    await runHappyPath(context, page, report);
    await runSessionExpiredPath(context, page, report);
    report.result = "passed";
  } catch (error) {
    report.errors.push({
      step: "suite_runtime",
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    const reportPath = path.join(outputDir, "results.json");
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    await context.close();
    await browser.close();
    console.log(`Saved login POS E2E smoke report to ${reportPath}`);
    if (report.result !== "passed") {
      process.exitCode = 1;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
