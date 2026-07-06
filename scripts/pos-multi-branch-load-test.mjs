#!/usr/bin/env node

/**
 * POS API load probe focused on multi-branch monitor pressure.
 * Usage:
 *   node scripts/pos-multi-branch-load-test.mjs --base http://localhost:3000 --seconds 30 --concurrency 20
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readArg(name, fallback) {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const base = String(readArg("base", "http://localhost:3000")).replace(/\/+$/, "");
const seconds = Math.max(5, parseNumber(readArg("seconds", "30"), 30));
const concurrency = Math.max(1, parseNumber(readArg("concurrency", "16"), 16));
const timeoutMs = Math.max(1000, parseNumber(readArg("timeout", "12000"), 12000));
const outFile = String(readArg("out", "docs/load-tests/pos-multi-branch-report.json"));

const scenarios = [
  { name: "branch_monitor", path: "/api/pos/monitor", weight: 4 },
  { name: "table_snapshot", path: "/api/pos/tables", weight: 3 },
  { name: "tenant_monitor", path: "/api/admin/pos/monitor", weight: 2 }
];

function pickScenario() {
  const totalWeight = scenarios.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const item of scenarios) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return scenarios[scenarios.length - 1];
}

const deadline = Date.now() + seconds * 1000;
const perScenario = new Map(
  scenarios.map((scenario) => [
    scenario.name,
    {
      requests: 0,
      ok: 0,
      failed: 0,
      statuses: new Map(),
      durations: []
    }
  ])
);

async function runOnce() {
  const scenario = pickScenario();
  const stat = perScenario.get(scenario.name);
  if (!stat) return;

  const url = `${base}${scenario.path}`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let statusCode = 0;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "cache-control": "no-store"
      },
      signal: controller.signal
    });
    statusCode = response.status;
    if (response.ok) {
      stat.ok += 1;
    } else {
      stat.failed += 1;
    }
  } catch {
    statusCode = 0;
    stat.failed += 1;
  } finally {
    clearTimeout(timeout);
    stat.requests += 1;
    stat.durations.push(Date.now() - startedAt);
    stat.statuses.set(statusCode, (stat.statuses.get(statusCode) ?? 0) + 1);
  }
}

async function worker() {
  while (Date.now() < deadline) {
    await runOnce();
  }
}

console.log(`[load-test] base=${base} seconds=${seconds} concurrency=${concurrency} timeoutMs=${timeoutMs}`);
await Promise.all(Array.from({ length: concurrency }, () => worker()));

const byScenario = {};
const totals = {
  requests: 0,
  ok: 0,
  failed: 0,
  durations: []
};

for (const [name, stat] of perScenario.entries()) {
  totals.requests += stat.requests;
  totals.ok += stat.ok;
  totals.failed += stat.failed;
  totals.durations.push(...stat.durations);
  byScenario[name] = {
    requests: stat.requests,
    ok: stat.ok,
    failed: stat.failed,
    error_rate_pct: stat.requests > 0 ? Number(((stat.failed / stat.requests) * 100).toFixed(2)) : 0,
    latency_ms: summarizeDurations(stat.durations),
    status_counts: Object.fromEntries([...stat.statuses.entries()].sort((a, b) => a[0] - b[0]))
  };
}

const report = {
  generated_at: new Date().toISOString(),
  base_url: base,
  duration_seconds: seconds,
  concurrency,
  request_timeout_ms: timeoutMs,
  totals: {
    requests: totals.requests,
    ok: totals.ok,
    failed: totals.failed,
    error_rate_pct: totals.requests > 0 ? Number(((totals.failed / totals.requests) * 100).toFixed(2)) : 0,
    throughput_rps: Number((totals.requests / seconds).toFixed(2)),
    latency_ms: summarizeDurations(totals.durations)
  },
  scenarios: byScenario
};

const targetPath = resolve(outFile);
mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify(report, null, 2));
console.log(`[load-test] report written to ${targetPath}`);
