import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const LOGIN_URL = process.env.POS_LOGIN_URL ?? "http://localhost:3000/login/store";
const POS_URL = process.env.POS_PREVIEW_URL ?? "http://localhost:3000/preview/pos";
const ORIGIN = new URL(POS_URL).origin;
const STORE_CODE = String(process.env.POS_SMOKE_STORE_CODE ?? "NDL-TH-001").trim().toUpperCase();
const OUT_DIR = path.resolve("docs/qa-screenshots/pos-e2e-final-checklist");
const HEADLESS = String(process.env.POS_SMOKE_HEADLESS ?? "1").trim() !== "0";
const API_TIMEOUT_MS = Number(process.env.POS_SMOKE_API_TIMEOUT_MS ?? 120000);

const ROLE_CASES = [
  { label: "staff", code: String(process.env.POS_STAFF_EMPLOYEE_CODE ?? "EMP-000103").trim().toUpperCase() },
  { label: "manager", code: String(process.env.POS_MANAGER_EMPLOYEE_CODE ?? "EMP-000102").trim().toUpperCase() },
  { label: "owner", code: String(process.env.POS_OWNER_EMPLOYEE_CODE ?? "182536").trim().toUpperCase() },
  { label: "accountant", code: String(process.env.POS_ACCOUNTANT_EMPLOYEE_CODE ?? "").trim().toUpperCase() }
].filter((item) => item.code);

const MENU_BY_ROLE = {
  owner: ["/preview/pos", "/preview/pos/sales-list", "/preview/pos/stock", "/preview/pos/sales-summary", "/preview/pos/receipts", "/preview/pos/tables", "/preview/pos/customer-display", "/preview/pos/users", "/preview/pos/settings"],
  manager: ["/preview/pos", "/preview/pos/sales-list", "/preview/pos/stock", "/preview/pos/sales-summary", "/preview/pos/receipts", "/preview/pos/tables", "/preview/pos/customer-display", "/preview/pos/users", "/preview/pos/settings"],
  staff: ["/preview/pos", "/preview/pos/sales-list", "/preview/pos/sales-summary", "/preview/pos/receipts", "/preview/pos/users"],
  accountant: ["/preview/pos/sales-list", "/preview/pos/sales-summary", "/preview/pos/receipts", "/preview/pos/users"]
};

const API_MATRIX = {
  owner: {
    "/api/pos/sales": 200,
    "/api/pos/sales-list": 200,
    "/api/pos/products": 200,
    "/api/pos/orders/current-shift": 200,
    "/api/pos/tables": 200,
    "/api/pos/monitor": 200,
    "/api/pos/customer-display": 200,
    "/api/pos/system/notice": 200,
    "/api/pos/attendance/status": [200, 403]
  },
  manager: {
    "/api/pos/sales": 200,
    "/api/pos/sales-list": 200,
    "/api/pos/products": 200,
    "/api/pos/orders/current-shift": 200,
    "/api/pos/tables": 200,
    "/api/pos/monitor": 200,
    "/api/pos/customer-display": 200,
    "/api/pos/system/notice": 200,
    "/api/pos/attendance/status": [200, 403]
  },
  staff: {
    "/api/pos/sales": 200,
    "/api/pos/sales-list": 200,
    "/api/pos/products": 200,
    "/api/pos/orders/current-shift": 200,
    "/api/pos/tables": 200,
    "/api/pos/monitor": 403,
    "/api/pos/customer-display": 403,
    "/api/pos/system/notice": 403,
    "/api/pos/attendance/status": [200, 403]
  },
  accountant: {
    "/api/pos/sales": 200,
    "/api/pos/sales-list": 200,
    "/api/pos/products": 403,
    "/api/pos/orders/current-shift": 200,
    "/api/pos/tables": 403,
    "/api/pos/monitor": 200,
    "/api/pos/customer-display": 403,
    "/api/pos/system/notice": 200,
    "/api/pos/attendance/status": [200, 403]
  }
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitForAnyRoute(page, parts, timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = page.url();
    if (parts.some((part) => current.includes(part))) return current;
    await page.waitForTimeout(120);
  }
  throw new Error(`Timeout waiting route ${parts.join(", ")} current=${page.url()}`);
}

async function safeJson(response) {
  return response.json().catch(() => null);
}

async function requestWithRetry(requestContext, fn, attempts = 3, waitMs = 450) {
  let lastError = null;
  for (let index = 1; index <= attempts; index += 1) {
    try {
      return await fn(requestContext);
    } catch (error) {
      lastError = error;
      if (index >= attempts) break;
      await new Promise((resolve) => setTimeout(resolve, waitMs * index));
    }
  }
  throw lastError ?? new Error("request failed");
}

async function requestJsonWithRetry(requestContext, method, url, options = {}) {
  const attempts = options.attempts ?? 3;
  const baseWait = options.waitMs ?? 700;
  return requestWithRetry(
    requestContext,
    async (ctx) => {
      const res =
        method === "POST"
          ? await ctx.post(url, { timeout: API_TIMEOUT_MS, ...options, attempts: undefined, waitMs: undefined })
          : method === "DELETE"
            ? await ctx.delete(url, { timeout: API_TIMEOUT_MS, ...options, attempts: undefined, waitMs: undefined })
            : await ctx.get(url, { timeout: API_TIMEOUT_MS, ...options, attempts: undefined, waitMs: undefined });
      const body = await safeJson(res);
      return { res, body };
    },
    attempts,
    baseWait
  );
}

function normalizeRole(value) {
  if (value === "owner" || value === "manager" || value === "staff" || value === "accountant") return value;
  return null;
}

async function loginFlow(page, employeeCode) {
  await page.request.delete(`${ORIGIN}/api/auth/store-code/verify`, { timeout: API_TIMEOUT_MS });

  const { res: storeVerifyRes, body: storeVerifyBody } = await requestJsonWithRetry(
    page.request,
    "POST",
    `${ORIGIN}/api/auth/store-code/verify`,
    {
      data: { store_code: STORE_CODE }
    }
  );
  if (!storeVerifyRes.ok() || !storeVerifyBody?.data) {
    throw new Error(`store_verify_failed status=${storeVerifyRes.status()} body=${JSON.stringify(storeVerifyBody)}`);
  }

  if (storeVerifyBody.data.next_step === "branches") {
    const { res: branchesRes, body: branchesBody } = await requestJsonWithRetry(page.request, "GET", `${ORIGIN}/api/auth/branches`);
    if (!branchesRes.ok() || !Array.isArray(branchesBody?.data?.branches) || branchesBody.data.branches.length === 0) {
      throw new Error(`branch_list_failed status=${branchesRes.status()} body=${JSON.stringify(branchesBody)}`);
    }
    const selectedBranch = branchesBody.data.branches[0];
    const { res: branchSelectRes, body: branchSelectBody } = await requestJsonWithRetry(
      page.request,
      "POST",
      `${ORIGIN}/api/auth/branches/select`,
      {
      data: { branch_id: selectedBranch.id }
      }
    );
    if (!branchSelectRes.ok()) {
      throw new Error(`branch_select_failed status=${branchSelectRes.status()} body=${JSON.stringify(branchSelectBody)}`);
    }
  }

  const { res: employeeVerifyRes, body: employeeVerifyBody } = await requestJsonWithRetry(
    page.request,
    "POST",
    `${ORIGIN}/api/auth/employee/verify-code`,
    {
      data: { employee_code: employeeCode }
    }
  );
  if (!employeeVerifyRes.ok() || employeeVerifyBody?.data?.next_step !== "devices") {
    throw new Error(`employee_verify_failed status=${employeeVerifyRes.status()} body=${JSON.stringify(employeeVerifyBody)}`);
  }

  const { res: devicesRes, body: devicesBody } = await requestJsonWithRetry(page.request, "GET", `${ORIGIN}/api/auth/devices`);
  if (!devicesRes.ok()) {
    throw new Error(`devices_failed status=${devicesRes.status()} body=${JSON.stringify(devicesBody)}`);
  }
  const devices = Array.isArray(devicesBody?.data?.devices) ? devicesBody.data.devices : [];
  const canOverride = Boolean(devicesBody?.data?.can_override_in_use);
  const pick =
    devices.find((item) => item?.status === "ready") ??
    (canOverride ? devices.find((item) => item?.status === "in_use") : null) ??
    devices.find((item) => item?.status !== "offline" && item?.status !== "disabled") ??
    null;

  if (pick?.deviceCode) {
    const { res: selectRes, body: selectBody } = await requestJsonWithRetry(
      page.request,
      "POST",
      `${ORIGIN}/api/auth/devices/select`,
      {
        data: { device_code: pick.deviceCode, force_override: pick.status === "in_use" }
      }
    );
    if (!selectRes.ok()) {
      throw new Error(`device_select_failed status=${selectRes.status()} body=${JSON.stringify(selectBody)}`);
    }
  } else {
    const compact = devices.map((item) => `${item.deviceCode}:${item.status}`).join(", ");
    throw new Error(`No eligible device for this role. device_statuses=[${compact}]`);
  }

  await page.goto(POS_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1100);
}

async function ensureShift(context) {
  const { res: current, body } = await requestJsonWithRetry(context.request, "GET", `${ORIGIN}/api/pos/shifts/current`);
  const currentShift = body?.data?.current_shift ?? null;
  const openShifts = Array.isArray(body?.data?.available_open_shifts) ? body.data.available_open_shifts : [];
  if (currentShift?.id) return;

  if (openShifts.length > 0) {
    await requestJsonWithRetry(context.request, "POST", `${ORIGIN}/api/pos/shifts/join`, { data: { shift_id: openShifts[0].id } });
    return;
  }

  await requestJsonWithRetry(context.request, "POST", `${ORIGIN}/api/pos/shifts/open`, { data: { opening_cash: 0 } });
}

async function collectSidebarLinks(page) {
  const links = await page.locator("aside a[href^='/preview/pos']").evaluateAll((items) =>
    items
      .map((item) => item.getAttribute("href"))
      .filter((href) => typeof href === "string" && href.startsWith("/preview/pos"))
  );
  return [...new Set(links)];
}

async function runRoleScenario(browser, roleCase) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const roleReport = {
    input: roleCase,
    resolvedRole: null,
    loginOk: false,
    menu: { expected: [], visible: [], pass: false, missing: [], unexpected: [] },
    api: {},
    pass: false,
    errors: []
  };

  try {
    await loginFlow(page, roleCase.code);
    await ensureShift(context);
    await page.goto(POS_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1400);

    const { res: sessionRes, body: sessionBody } = await requestJsonWithRetry(context.request, "GET", `${ORIGIN}/api/pos/session/current`, {
      attempts: 4,
      waitMs: 1000
    });
    if (!sessionRes.ok()) {
      throw new Error(`session_current failed status=${sessionRes.status()} body=${JSON.stringify(sessionBody)}`);
    }
    const resolvedRole = normalizeRole(sessionBody?.data?.role);
    roleReport.resolvedRole = resolvedRole;
    roleReport.loginOk = true;

    const screenshotName = `${roleCase.label}-01-pos.png`;
    await page.screenshot({ path: path.join(OUT_DIR, screenshotName), fullPage: true });

    await page.waitForTimeout(1600);
    const visible = await collectSidebarLinks(page);
    const expected = MENU_BY_ROLE[resolvedRole ?? roleCase.label] ?? [];
    const missing = expected.filter((href) => !visible.includes(href));
    const unexpected = visible.filter((href) => !expected.includes(href));
    roleReport.menu = {
      expected,
      visible,
      pass: missing.length === 0 && unexpected.length === 0,
      missing,
      unexpected
    };

    const apiExpect = API_MATRIX[resolvedRole ?? roleCase.label] ?? {};
    for (const [endpoint, expectedStatus] of Object.entries(apiExpect)) {
      const { res, body } = await requestJsonWithRetry(context.request, "GET", `${ORIGIN}${endpoint}`, {
        attempts: 3,
        waitMs: 900
      });
      const actualStatus = res.status();
      const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      const ok = expectedStatuses.includes(actualStatus);
      roleReport.api[endpoint] = {
        expectedStatus: expectedStatuses,
        actualStatus,
        ok,
        errorCode: body?.error?.code ?? null
      };
    }

    const apiPass = Object.values(roleReport.api).every((item) => item.ok);
    roleReport.pass = roleReport.loginOk && roleReport.menu.pass && apiPass;
  } catch (error) {
    roleReport.errors.push(error instanceof Error ? error.message : String(error));
    try {
      await page.screenshot({ path: path.join(OUT_DIR, `${roleCase.label}-99-error.png`), fullPage: true });
    } catch {}
  } finally {
    await context.close();
  }

  return roleReport;
}

async function run() {
  await ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: HEADLESS });

  const report = {
    generatedAt: new Date().toISOString(),
    base: { loginUrl: LOGIN_URL, posUrl: POS_URL, storeCode: STORE_CODE },
    roles: [],
    summary: { pass: false, total: 0, passed: 0, failed: 0 }
  };

  try {
    for (const roleCase of ROLE_CASES) {
      const result = await runRoleScenario(browser, roleCase);
      report.roles.push(result);
    }
  } finally {
    await browser.close();
  }

  report.summary.total = report.roles.length;
  report.summary.passed = report.roles.filter((item) => item.pass).length;
  report.summary.failed = report.roles.length - report.summary.passed;
  report.summary.pass = report.summary.failed === 0;

  const reportPath = path.join(OUT_DIR, "results.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Saved final checklist report to ${reportPath}`);

  if (!report.summary.pass) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
