import fs from "node:fs/promises";
import path from "node:path";

function parseEnv(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadEnv() {
  const candidates = [path.resolve("apps/backoffice-web/.env.local"), path.resolve(".env.local")];
  for (const file of candidates) {
    try {
      const parsed = parseEnv(await fs.readFile(file, "utf8"));
      if (parsed.NEXT_PUBLIC_SUPABASE_URL && parsed.SUPABASE_SERVICE_ROLE_KEY) {
        return {
          supabaseUrl: parsed.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, ""),
          serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY
        };
      }
    } catch {
      // continue
    }
  }
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env files.");
}

function restHeaders(serviceRoleKey, prefer = "return=representation") {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

function buildInFilter(values) {
  return `in.(${values.map((v) => encodeURIComponent(v)).join(",")})`;
}

async function restRequest({ method, url, key, body, prefer }) {
  const response = await fetch(url, {
    method,
    headers: restHeaders(key, prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

function employeeCodeForRole(role, userId) {
  if (role === "owner") return "182536";
  const suffix = String(userId).replace(/-/g, "").slice(-6).toUpperCase();
  if (role === "manager") return `MGR-${suffix}`;
  if (role === "accountant") return `ACC-${suffix}`;
  return `STF-${suffix}`;
}

function positionForRole(role) {
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  if (role === "accountant") return "Accountant";
  return "Staff";
}

async function main() {
  const env = await loadEnv();

  const tenants = await restRequest({
    method: "GET",
    url: `${env.supabaseUrl}/rest/v1/tenants?select=id,code&code=like.*-TH-*`,
    key: env.serviceRoleKey
  });

  const tenantIds = (tenants ?? []).map((tenant) => String(tenant.id));
  if (tenantIds.length === 0) {
    throw new Error("No demo tenants found.");
  }

  const roles = await restRequest({
    method: "GET",
    url: `${env.supabaseUrl}/rest/v1/user_branch_roles?select=tenant_id,user_id,role,is_default&tenant_id=${buildInFilter(tenantIds)}&order=is_default.desc`,
    key: env.serviceRoleKey
  });

  const byTenantUser = new Map();
  for (const roleRow of roles ?? []) {
    const key = `${roleRow.tenant_id}:${roleRow.user_id}`;
    const existing = byTenantUser.get(key);
    if (existing && existing.role === "owner") continue;
    if (existing && roleRow.role !== "owner" && existing.is_default) continue;
    byTenantUser.set(key, roleRow);
  }

  const rows = Array.from(byTenantUser.values()).map((roleRow) => {
    return {
      tenant_id: roleRow.tenant_id,
      user_id: roleRow.user_id,
      employee_code: employeeCodeForRole(roleRow.role, roleRow.user_id),
      position_title: positionForRole(roleRow.role),
      permission_role: roleRow.role
    };
  });

  await restRequest({
    method: "POST",
    url: `${env.supabaseUrl}/rest/v1/pos_user_profiles?on_conflict=tenant_id,user_id`,
    key: env.serviceRoleKey,
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  console.log(`Updated ${rows.length} demo POS user profiles. Owner employee code: 182536`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
