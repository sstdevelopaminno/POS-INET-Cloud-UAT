#!/usr/bin/env node

/**
 * POS login/session bottleneck load test
 * Focus:
 * - store -> branch -> employee -> device -> session creation
 * - conflict behavior on shared device under concurrency
 *
 * Usage example:
 * node scripts/pos-login-session-bottleneck-load-test.mjs \
 *   --login-base http://localhost:3000 \
 *   --pos-base http://localhost:3000 \
 *   --store-code NDL-TH-001 \
 *   --employee-codes EMP-000101,EMP-000102 \
 *   --device-codes POS-DEMO-01 \
 *   --seconds 30 \
 *   --concurrency 20 \
 *   --mode conflict \
 *   --out docs/load-tests/pos-login-session-bottleneck-report.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readArg(name, fallback = "") {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBool(value, fallback) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function parseList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeDurations(durations) {
  if (durations.length === 0) {
    return { count: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  }
  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    count: durations.length,
    min: Math.min(...durations),
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
    max: Math.max(...durations),
    avg: Number((total / durations.length).toFixed(2))
  };
}

class CookieJar {
  constructor() {
    this.values = new Map();
  }

  applyFromResponse(response) {
    const headerList =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);

    for (const rawHeader of headerList) {
      const firstPart = String(rawHeader).split(";", 1)[0] ?? "";
      const eqIndex = firstPart.indexOf("=");
      if (eqIndex <= 0) continue;
      const key = firstPart.slice(0, eqIndex).trim();
      const value = firstPart.slice(eqIndex + 1).trim();
      if (!key) continue;
      this.values.set(key, value);
    }
  }

  asHeaderValue() {
    return [...this.values.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

function createStepStats() {
  return {
    requests: 0,
    ok: 0,
    failed: 0,
    durations: [],
    status_counts: new Map(),
    error_codes: new Map()
  };
}

function touchStep(collector, stepName, result) {
  if (!collector.steps.has(stepName)) {
    collector.steps.set(stepName, createStepStats());
  }
  const step = collector.steps.get(stepName);
  step.requests += 1;
  step.durations.push(result.durationMs);
  step.status_counts.set(result.status, (step.status_counts.get(result.status) ?? 0) + 1);

  if (result.ok) {
    step.ok += 1;
  } else {
    step.failed += 1;
    if (result.errorCode) {
      step.error_codes.set(result.errorCode, (step.error_codes.get(result.errorCode) ?? 0) + 1);
    }
  }
}

async function apiRequest({ jar, method, url, body, timeoutMs }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response = null;
  let responseBody = null;
  let status = 0;
  let ok = false;
  let errorCode = null;

  try {
    const headers = {};
    const cookieHeader = jar.asHeaderValue();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });

    jar.applyFromResponse(response);
    responseBody = await response.json().catch(() => null);
    status = response.status;
    ok = response.ok;
    errorCode = responseBody?.error?.code ?? null;
  } catch {
    status = 0;
    ok = false;
    errorCode = "request_failed";
  } finally {
    clearTimeout(timeout);
  }

  return {
    ok,
    status,
    body: responseBody,
    errorCode,
    durationMs: Date.now() - startedAt
  };
}

const loginBase = String(readArg("login-base", process.env.POS_LOAD_LOGIN_BASE ?? "http://localhost:3000")).replace(/\/+$/, "");
const posBase = String(readArg("pos-base", process.env.POS_LOAD_POS_BASE ?? "http://localhost:3000")).replace(/\/+$/, "");
const storeCode = String(readArg("store-code", process.env.POS_SMOKE_STORE_CODE ?? "")).trim().toUpperCase();
const employeeCodes = parseList(readArg("employee-codes", process.env.POS_LOAD_EMPLOYEE_CODES ?? process.env.POS_SMOKE_EMPLOYEE_CODE ?? ""))
  .map((item) => item.toUpperCase());
const deviceCodes = parseList(readArg("device-codes", process.env.POS_LOAD_DEVICE_CODES ?? process.env.POS_SMOKE_DEVICE_CODE ?? ""))
  .map((item) => item.toUpperCase());
const branchCode = String(readArg("branch-code", process.env.POS_SMOKE_BRANCH_CODE ?? "")).trim().toUpperCase();
const seconds = Math.max(5, parseNumber(readArg("seconds", "30"), 30));
const concurrency = Math.max(1, parseNumber(readArg("concurrency", "20"), 20));
const timeoutMs = Math.max(1000, parseNumber(readArg("timeout", "12000"), 12000));
const mode = String(readArg("mode", process.env.POS_LOAD_MODE ?? "conflict")).trim().toLowerCase();
const forceOverride = parseBool(readArg("force-override", process.env.POS_LOAD_FORCE_OVERRIDE ?? "false"), false);
const verifyPosSession = parseBool(readArg("verify-pos-session", process.env.POS_LOAD_VERIFY_POS_SESSION ?? "true"), true);
const outFile = String(readArg("out", "docs/load-tests/pos-login-session-bottleneck-report.json"));

if (!storeCode) {
  throw new Error("Missing --store-code or POS_SMOKE_STORE_CODE.");
}
if (employeeCodes.length === 0) {
  throw new Error("Missing --employee-codes or POS_LOAD_EMPLOYEE_CODES/POS_SMOKE_EMPLOYEE_CODE.");
}
if (deviceCodes.length === 0) {
  throw new Error("Missing --device-codes or POS_LOAD_DEVICE_CODES/POS_SMOKE_DEVICE_CODE.");
}

function pickDevice(workerId, iteration) {
  if (mode === "conflict") return deviceCodes[0];
  if (mode === "distributed") return deviceCodes[Math.floor(Math.random() * deviceCodes.length)];
  return deviceCodes[(workerId + iteration) % deviceCodes.length];
}

function pickEmployee(workerId, iteration) {
  return employeeCodes[(workerId + iteration) % employeeCodes.length];
}

const deadline = Date.now() + seconds * 1000;
const collector = {
  totals: {
    flows: 0,
    passed: 0,
    failed: 0,
    durations: []
  },
  failures: new Map(),
  steps: new Map()
};

async function runFlow(workerId, iteration) {
  const flowStartedAt = Date.now();
  const jar = new CookieJar();
  const employeeCode = pickEmployee(workerId, iteration);
  const deviceCode = pickDevice(workerId, iteration);

  const markFailure = (reason) => {
    collector.failures.set(reason, (collector.failures.get(reason) ?? 0) + 1);
  };

  const storeVerify = await apiRequest({
    jar,
    method: "POST",
    url: `${loginBase}/api/auth/store-code/verify`,
    body: { store_code: storeCode },
    timeoutMs
  });
  touchStep(collector, "store_verify", storeVerify);
  if (!storeVerify.ok || !storeVerify.body?.data) {
    markFailure(`store_verify:${storeVerify.errorCode ?? storeVerify.status}`);
    return false;
  }

  const branches = Array.isArray(storeVerify.body.data.branches) ? storeVerify.body.data.branches : [];
  const nextStep = String(storeVerify.body.data.next_step ?? "");
  let selectedBranchId = storeVerify.body.data.selected_branch?.id ?? null;

  if (nextStep === "branches") {
    const branchTarget =
      (branchCode ? branches.find((item) => String(item?.code ?? "").trim().toUpperCase() === branchCode) : null) ??
      branches[0] ??
      null;
    if (!branchTarget?.id) {
      markFailure("branch_missing");
      return false;
    }
    selectedBranchId = branchTarget.id;
    const branchSelect = await apiRequest({
      jar,
      method: "POST",
      url: `${loginBase}/api/auth/branches/select`,
      body: { branch_id: selectedBranchId },
      timeoutMs
    });
    touchStep(collector, "branch_select", branchSelect);
    if (!branchSelect.ok) {
      markFailure(`branch_select:${branchSelect.errorCode ?? branchSelect.status}`);
      return false;
    }
  }

  const employeeVerify = await apiRequest({
    jar,
    method: "POST",
    url: `${loginBase}/api/auth/employee/verify-code`,
    body: { employee_code: employeeCode },
    timeoutMs
  });
  touchStep(collector, "employee_verify", employeeVerify);
  if (!employeeVerify.ok) {
    markFailure(`employee_verify:${employeeVerify.errorCode ?? employeeVerify.status}`);
    return false;
  }

  const deviceSelect = await apiRequest({
    jar,
    method: "POST",
    url: `${loginBase}/api/auth/devices/select`,
    body: { device_code: deviceCode, force_override: forceOverride },
    timeoutMs
  });
  touchStep(collector, "device_select", deviceSelect);
  if (!deviceSelect.ok) {
    markFailure(`device_select:${deviceSelect.errorCode ?? deviceSelect.status}`);
    return false;
  }

  if (verifyPosSession) {
    const sessionCheck = await apiRequest({
      jar,
      method: "GET",
      url: `${posBase}/api/pos/session/current`,
      timeoutMs
    });
    touchStep(collector, "session_current", sessionCheck);
    if (!sessionCheck.ok || !sessionCheck.body?.data) {
      markFailure(`session_current:${sessionCheck.errorCode ?? sessionCheck.status}`);
      return false;
    }

    const responseBranchId = String(sessionCheck.body?.data?.branch?.id ?? "");
    if (selectedBranchId && responseBranchId && responseBranchId !== selectedBranchId) {
      markFailure("scope_mismatch:branch");
      return false;
    }
  }

  collector.totals.durations.push(Date.now() - flowStartedAt);
  return true;
}

async function worker(workerId) {
  let iteration = 0;
  while (Date.now() < deadline) {
    const ok = await runFlow(workerId, iteration);
    collector.totals.flows += 1;
    if (ok) {
      collector.totals.passed += 1;
    } else {
      collector.totals.failed += 1;
    }
    iteration += 1;
  }
}

console.log(
  `[login-load] loginBase=${loginBase} posBase=${posBase} storeCode=${storeCode} seconds=${seconds} concurrency=${concurrency} mode=${mode}`
);

await Promise.all(Array.from({ length: concurrency }, (_, idx) => worker(idx)));

const stepSummary = {};
for (const [name, stat] of collector.steps.entries()) {
  stepSummary[name] = {
    requests: stat.requests,
    ok: stat.ok,
    failed: stat.failed,
    error_rate_pct: stat.requests > 0 ? Number(((stat.failed / stat.requests) * 100).toFixed(2)) : 0,
    latency_ms: summarizeDurations(stat.durations),
    status_counts: Object.fromEntries([...stat.status_counts.entries()].sort((a, b) => a[0] - b[0])),
    error_codes: Object.fromEntries([...stat.error_codes.entries()].sort((a, b) => b[1] - a[1]))
  };
}

const totals = collector.totals;
const failedFlows = totals.failed;
const failureMap = Object.fromEntries([...collector.failures.entries()].sort((a, b) => b[1] - a[1]));
const deviceSelectStats = stepSummary.device_select ?? { requests: 0, error_codes: {} };
const deviceInUseCount = Number(deviceSelectStats.error_codes?.device_in_use ?? 0);
const sessionConflictCount = Number(deviceSelectStats.error_codes?.session_scope_conflict ?? 0);
const scopeMismatchCount = Number(failureMap["scope_mismatch:branch"] ?? 0);

const report = {
  generated_at: new Date().toISOString(),
  config: {
    login_base: loginBase,
    pos_base: posBase,
    store_code: storeCode,
    employee_codes: employeeCodes,
    device_codes: deviceCodes,
    branch_code: branchCode || null,
    seconds,
    concurrency,
    timeout_ms: timeoutMs,
    mode,
    force_override: forceOverride,
    verify_pos_session: verifyPosSession
  },
  totals: {
    flows: totals.flows,
    passed: totals.passed,
    failed: totals.failed,
    flow_error_rate_pct: totals.flows > 0 ? Number(((totals.failed / totals.flows) * 100).toFixed(2)) : 0,
    throughput_flows_per_sec: Number((totals.flows / seconds).toFixed(2)),
    flow_latency_ms: summarizeDurations(totals.durations)
  },
  bottleneck_indicators: {
    device_in_use_conflicts: deviceInUseCount,
    session_scope_conflicts: sessionConflictCount,
    scope_mismatch_branch: scopeMismatchCount,
    conflict_share_of_failed_flows_pct:
      failedFlows > 0 ? Number((((deviceInUseCount + sessionConflictCount) / failedFlows) * 100).toFixed(2)) : 0
  },
  failures: failureMap,
  steps: stepSummary
};

const targetPath = resolve(outFile);
mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify(report, null, 2));
console.log(`[login-load] report written to ${targetPath}`);
