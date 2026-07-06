import fs from "node:fs";

function loadEnv() {
  const env = {};
  for (const file of [".env.local", "apps/backoffice-web/.env.local"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) continue;
      env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const search = process.argv[2] || "ลาดพร้าว";
const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  "User-Agent": "pos-preview-server-inspector"
};

async function restGet(path) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

const branches = await restGet(
  `branches?select=id,tenant_id,code,name,is_active&or=(name.ilike.*${encodeURIComponent(search)}*,name.ilike.*Ladprao*,code.ilike.*LAD*)&order=name.asc`
);

const rows = [];
for (const branch of branches ?? []) {
  const roles = await restGet(
    `user_branch_roles?select=user_id,role,users_profiles!inner(id,email,full_name,is_active)&tenant_id=eq.${branch.tenant_id}&branch_id=eq.${branch.id}&order=role.asc`
  );

  for (const role of roles ?? []) {
    const profile = Array.isArray(role.users_profiles) ? role.users_profiles[0] : role.users_profiles;
    rows.push({
      branchName: branch.name,
      branchCode: branch.code,
      tenantId: branch.tenant_id,
      branchId: branch.id,
      role: role.role,
      userId: role.user_id,
      email: profile?.email,
      fullName: profile?.full_name,
      active: profile?.is_active
    });
  }
}

console.log(JSON.stringify(rows, null, 2));
