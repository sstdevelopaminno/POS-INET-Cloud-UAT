import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const databaseUrl = process.env.DATABASE_URL;

function findPsql() {
  if (process.env.PSQL_BIN) return process.env.PSQL_BIN;

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

const psql = findPsql();

if (!databaseUrl) {
  console.error("Missing DATABASE_URL. Example: postgres://user:password@host:5432/dbname?sslmode=require");
  process.exit(1);
}

function runSql(label, sql) {
  console.log(`\n==> ${label}`);
  console.log(`Using psql: ${psql}`);
  const result = spawnSync(psql, ["-v", "ON_ERROR_STOP=1", databaseUrl], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"]
  });

  if (result.error) {
    console.error(`Failed to run ${psql}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Migration failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

const compatibilitySql = readFileSync(
  join(root, "infra", "inet-cloud-postgres", "000_auth_compat.sql"),
  "utf8"
);

runSql("inet-cloud-postgres auth compatibility", compatibilitySql);

const migrationsDir = join(root, "supabase", "migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right));

for (const file of migrationFiles) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  runSql(file, sql);
}

console.log("\nINET Cloud PostgreSQL schema is ready.");
