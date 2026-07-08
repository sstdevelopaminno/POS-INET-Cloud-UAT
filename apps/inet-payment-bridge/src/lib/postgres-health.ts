import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function findPsql() {
  const configured = env("PSQL_BIN");
  if (configured) return configured;

  const windowsRoot = "C:\\Program Files\\PostgreSQL";
  if (process.platform === "win32" && existsSync(windowsRoot)) {
    const versions = readdirSync(windowsRoot)
      .filter((name) => /^\d+$/.test(name))
      .sort((left, right) => Number(right) - Number(left));

    for (const version of versions) {
      const candidate = join(windowsRoot, version, "bin", "psql.exe");
      if (existsSync(candidate)) return candidate;
    }
  }

  return "psql";
}

function bool(value: string | undefined) {
  return value === "t" || value === "true";
}

function safeDetail(value: string) {
  return value.replaceAll(env("DATABASE_URL"), "[DATABASE_URL]").trim().slice(0, 500);
}

export function checkInetPostgres() {
  const databaseUrl = env("DATABASE_URL");
  if (!databaseUrl) {
    return {
      ok: false,
      configured: false,
      error: "database_url_missing"
    };
  }

  const psql = findPsql();
  const sql = [
    "select",
    "current_database(),",
    "to_regclass('public.tenants') is not null,",
    "to_regclass('public.orders') is not null,",
    "to_regclass('public.pos_payment_intents') is not null,",
    "to_regclass('auth.users') is not null;"
  ].join(" ");

  const result = spawnSync(
    psql,
    ["-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", ",", "-c", sql, databaseUrl],
    {
      encoding: "utf8",
      timeout: 8000
    }
  );

  if (result.error) {
    return {
      ok: false,
      configured: true,
      psql,
      error: "psql_spawn_failed",
      detail: result.error.message
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      configured: true,
      psql,
      error: "psql_query_failed",
      detail: safeDetail(result.stderr || result.stdout || "psql exited with a non-zero status")
    };
  }

  const line = result.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  const [database, tenants, orders, posPaymentIntents, authUsers] = (line || "").split(",");

  return {
    ok: true,
    configured: true,
    psql,
    database,
    checks: {
      tenants: bool(tenants),
      orders: bool(orders),
      pos_payment_intents: bool(posPaymentIntents),
      auth_users: bool(authUsers)
    }
  };
}
