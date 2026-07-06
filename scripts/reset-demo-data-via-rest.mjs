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
      const raw = await fs.readFile(file, "utf8");
      const parsed = parseEnv(raw);
      if (parsed.NEXT_PUBLIC_SUPABASE_URL && parsed.SUPABASE_SERVICE_ROLE_KEY) {
        return {
          supabaseUrl: parsed.NEXT_PUBLIC_SUPABASE_URL,
          serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
          source: file
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
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function authAdminRequest({ method, url, key, body }) {
  const response = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json;
}

const STARTER_PACKAGE = {
  id: "10000000-0000-0000-0000-000000000001",
  code: "starter",
  name: "Starter MVP",
  monthly_price: 990,
  max_branches: 3,
  is_active: true
};

const DEMO_TENANTS = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    code: "NDL-TH-001",
    name: "Noodle Demo",
    owner_name: "Owner Noodle",
    owner_phone: "0899990001",
    package_id: STARTER_PACKAGE.id,
    is_active: true
  },
  {
    id: "00000000-0000-0000-0000-000000010001",
    code: "CAF-TH-001",
    name: "Cafe Atlas",
    owner_name: "Owner Cafe Atlas",
    owner_phone: "0811001001",
    package_id: STARTER_PACKAGE.id,
    is_active: true
  },
  {
    id: "00000000-0000-0000-0000-000000010002",
    code: "BBQ-TH-002",
    name: "Bangkok BBQ Lab",
    owner_name: "Owner BBQ Lab",
    owner_phone: "0811001002",
    package_id: STARTER_PACKAGE.id,
    is_active: true
  },
  {
    id: "00000000-0000-0000-0000-000000010003",
    code: "SFD-TH-003",
    name: "Seafood Dock",
    owner_name: "Owner Seafood Dock",
    owner_phone: "0811001003",
    package_id: STARTER_PACKAGE.id,
    is_active: true
  },
  {
    id: "00000000-0000-0000-0000-000000010004",
    code: "BAK-TH-004",
    name: "Baker Street 24",
    owner_name: "Owner Baker Street 24",
    owner_phone: "0811001004",
    package_id: STARTER_PACKAGE.id,
    is_active: true
  },
  {
    id: "00000000-0000-0000-0000-000000010005",
    code: "TEA-TH-005",
    name: "Tea Time House",
    owner_name: "Owner Tea Time House",
    owner_phone: "0811001005",
    package_id: STARTER_PACKAGE.id,
    is_active: true
  },
  {
    id: "00000000-0000-0000-0000-000000010006",
    code: "PIZ-TH-006",
    name: "Pizza Factory",
    owner_name: "Owner Pizza Factory",
    owner_phone: "0811001006",
    package_id: STARTER_PACKAGE.id,
    is_active: true
  }
];

const DEMO_BRANCHES = [
  { id: "00000000-0000-0000-0000-000000000011", tenant_id: "00000000-0000-0000-0000-000000000001", code: "BKK-01", name: "อ่อนนุช", address: "Bangkok", is_active: true },
  { id: "00000000-0000-0000-0000-000000000012", tenant_id: "00000000-0000-0000-0000-000000000001", code: "BKK-02", name: "ลาดพร้าว", address: "Bangkok", is_active: true },
  { id: "00000000-0000-0000-0000-000000020011", tenant_id: "00000000-0000-0000-0000-000000010001", code: "CAF-BKK-01", name: "Cafe Atlas Rama9", address: "Bangkok", is_active: true },
  { id: "00000000-0000-0000-0000-000000020012", tenant_id: "00000000-0000-0000-0000-000000010001", code: "CAF-CNX-01", name: "Cafe Atlas Nimman", address: "Chiang Mai", is_active: true },
  { id: "00000000-0000-0000-0000-000000020021", tenant_id: "00000000-0000-0000-0000-000000010002", code: "BBQ-BKK-01", name: "BBQ Lab Ladprao", address: "Bangkok", is_active: true },
  { id: "00000000-0000-0000-0000-000000020022", tenant_id: "00000000-0000-0000-0000-000000010002", code: "BBQ-PKT-01", name: "BBQ Lab Patong", address: "Phuket", is_active: true },
  { id: "00000000-0000-0000-0000-000000020031", tenant_id: "00000000-0000-0000-0000-000000010003", code: "SFD-BKK-01", name: "Seafood Dock Sathorn", address: "Bangkok", is_active: true },
  { id: "00000000-0000-0000-0000-000000020032", tenant_id: "00000000-0000-0000-0000-000000010003", code: "SFD-HDY-01", name: "Seafood Dock Hatyai", address: "Songkhla", is_active: true },
  { id: "00000000-0000-0000-0000-000000020041", tenant_id: "00000000-0000-0000-0000-000000010004", code: "BAK-BKK-01", name: "Baker Street Central", address: "Bangkok", is_active: true },
  { id: "00000000-0000-0000-0000-000000020042", tenant_id: "00000000-0000-0000-0000-000000010004", code: "BAK-KKN-01", name: "Baker Street Khonkaen", address: "Khon Kaen", is_active: true },
  { id: "00000000-0000-0000-0000-000000020051", tenant_id: "00000000-0000-0000-0000-000000010005", code: "TEA-BKK-01", name: "Tea Time Siam", address: "Bangkok", is_active: true },
  { id: "00000000-0000-0000-0000-000000020052", tenant_id: "00000000-0000-0000-0000-000000010005", code: "TEA-URT-01", name: "Tea Time Surat", address: "Surat Thani", is_active: true },
  { id: "00000000-0000-0000-0000-000000020061", tenant_id: "00000000-0000-0000-0000-000000010006", code: "PIZ-BKK-01", name: "Pizza Factory Bangna", address: "Bangkok", is_active: true },
  { id: "00000000-0000-0000-0000-000000020062", tenant_id: "00000000-0000-0000-0000-000000010006", code: "PIZ-CBI-01", name: "Pizza Factory Chonburi", address: "Chonburi", is_active: true }
];

const DEMO_USERS = [
  { id: "00000000-0000-0000-0000-000000000101", email: "owner@noodle.local", full_name: "Owner Noodle", platform_role: "tenant_user", pin_hash: "$2b$10$hlUTBQXtPd.rLARdgqwdCevHf.H5lCFdkyEWgBuMp14bFXpT6rdPa", is_active: true },
  { id: "00000000-0000-0000-0000-000000000102", email: "manager@noodle.local", full_name: "Manager Noodle", platform_role: "tenant_user", pin_hash: "$2b$10$xQcyWHhdQv9np9kafFlupedqZlEQQXVzOmXhSJxd/Hqw7ZWQ6xeO.", is_active: true },
  { id: "00000000-0000-0000-0000-000000000103", email: "staff@noodle.local", full_name: "Staff Noodle", platform_role: "tenant_user", pin_hash: "$2b$10$KKtFBMTXToXbAoykqHz6uOyMTVchHrBwVUt4CUEJF6WkVQffUM482", is_active: true },
  { id: "00000000-0000-0000-0000-000000030011", email: "owner.caf@demo.local", full_name: "Owner Cafe Atlas", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030012", email: "manager.caf@demo.local", full_name: "Manager Cafe Atlas", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030013", email: "staff.caf@demo.local", full_name: "Staff Cafe Atlas", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030021", email: "owner.bbq@demo.local", full_name: "Owner BBQ Lab", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030022", email: "manager.bbq@demo.local", full_name: "Manager BBQ Lab", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030023", email: "staff.bbq@demo.local", full_name: "Staff BBQ Lab", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030031", email: "owner.sfd@demo.local", full_name: "Owner Seafood Dock", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030032", email: "manager.sfd@demo.local", full_name: "Manager Seafood Dock", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030033", email: "staff.sfd@demo.local", full_name: "Staff Seafood Dock", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030041", email: "owner.bak@demo.local", full_name: "Owner Baker Street 24", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030042", email: "manager.bak@demo.local", full_name: "Manager Baker Street 24", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030043", email: "staff.bak@demo.local", full_name: "Staff Baker Street 24", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030051", email: "owner.tea@demo.local", full_name: "Owner Tea Time House", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030052", email: "manager.tea@demo.local", full_name: "Manager Tea Time House", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030053", email: "staff.tea@demo.local", full_name: "Staff Tea Time House", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030061", email: "owner.piz@demo.local", full_name: "Owner Pizza Factory", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030062", email: "manager.piz@demo.local", full_name: "Manager Pizza Factory", platform_role: "tenant_user", pin_hash: null, is_active: true },
  { id: "00000000-0000-0000-0000-000000030063", email: "staff.piz@demo.local", full_name: "Staff Pizza Factory", platform_role: "tenant_user", pin_hash: null, is_active: true }
];

const DEMO_ROLE_ROWS = [
  // Noodle
  { id: "20000000-0000-0000-0000-000000000001", user_id: "00000000-0000-0000-0000-000000000101", tenant_id: "00000000-0000-0000-0000-000000000001", branch_id: "00000000-0000-0000-0000-000000000011", role: "owner", is_default: true },
  { id: "20000000-0000-0000-0000-000000000002", user_id: "00000000-0000-0000-0000-000000000102", tenant_id: "00000000-0000-0000-0000-000000000001", branch_id: "00000000-0000-0000-0000-000000000011", role: "manager", is_default: true },
  { id: "20000000-0000-0000-0000-000000000003", user_id: "00000000-0000-0000-0000-000000000103", tenant_id: "00000000-0000-0000-0000-000000000001", branch_id: "00000000-0000-0000-0000-000000000011", role: "staff", is_default: true },
  { id: "20000000-0000-0000-0000-000000000004", user_id: "00000000-0000-0000-0000-000000000101", tenant_id: "00000000-0000-0000-0000-000000000001", branch_id: "00000000-0000-0000-0000-000000000012", role: "owner", is_default: false },
  { id: "20000000-0000-0000-0000-000000000005", user_id: "00000000-0000-0000-0000-000000000102", tenant_id: "00000000-0000-0000-0000-000000000001", branch_id: "00000000-0000-0000-0000-000000000012", role: "manager", is_default: false },
  // CAF
  { id: "00000000-0000-0000-0000-000000040001", user_id: "00000000-0000-0000-0000-000000030011", tenant_id: "00000000-0000-0000-0000-000000010001", branch_id: "00000000-0000-0000-0000-000000020011", role: "owner", is_default: true },
  { id: "00000000-0000-0000-0000-000000040002", user_id: "00000000-0000-0000-0000-000000030011", tenant_id: "00000000-0000-0000-0000-000000010001", branch_id: "00000000-0000-0000-0000-000000020012", role: "owner", is_default: false },
  { id: "00000000-0000-0000-0000-000000040003", user_id: "00000000-0000-0000-0000-000000030012", tenant_id: "00000000-0000-0000-0000-000000010001", branch_id: "00000000-0000-0000-0000-000000020011", role: "manager", is_default: true },
  { id: "00000000-0000-0000-0000-000000040004", user_id: "00000000-0000-0000-0000-000000030012", tenant_id: "00000000-0000-0000-0000-000000010001", branch_id: "00000000-0000-0000-0000-000000020012", role: "manager", is_default: false },
  { id: "00000000-0000-0000-0000-000000040005", user_id: "00000000-0000-0000-0000-000000030013", tenant_id: "00000000-0000-0000-0000-000000010001", branch_id: "00000000-0000-0000-0000-000000020011", role: "staff", is_default: true },
  // BBQ
  { id: "00000000-0000-0000-0000-000000040006", user_id: "00000000-0000-0000-0000-000000030021", tenant_id: "00000000-0000-0000-0000-000000010002", branch_id: "00000000-0000-0000-0000-000000020021", role: "owner", is_default: true },
  { id: "00000000-0000-0000-0000-000000040007", user_id: "00000000-0000-0000-0000-000000030021", tenant_id: "00000000-0000-0000-0000-000000010002", branch_id: "00000000-0000-0000-0000-000000020022", role: "owner", is_default: false },
  { id: "00000000-0000-0000-0000-000000040008", user_id: "00000000-0000-0000-0000-000000030022", tenant_id: "00000000-0000-0000-0000-000000010002", branch_id: "00000000-0000-0000-0000-000000020021", role: "manager", is_default: true },
  { id: "00000000-0000-0000-0000-000000040009", user_id: "00000000-0000-0000-0000-000000030022", tenant_id: "00000000-0000-0000-0000-000000010002", branch_id: "00000000-0000-0000-0000-000000020022", role: "manager", is_default: false },
  { id: "00000000-0000-0000-0000-000000040010", user_id: "00000000-0000-0000-0000-000000030023", tenant_id: "00000000-0000-0000-0000-000000010002", branch_id: "00000000-0000-0000-0000-000000020021", role: "staff", is_default: true }
];

function createAdditionalRoles() {
  const pairs = [
    ["sfd", "00000000-0000-0000-0000-000000010003", "00000000-0000-0000-0000-000000020031", "00000000-0000-0000-0000-000000020032", "00000000-0000-0000-0000-000000030031", "00000000-0000-0000-0000-000000030032", "00000000-0000-0000-0000-000000030033"],
    ["bak", "00000000-0000-0000-0000-000000010004", "00000000-0000-0000-0000-000000020041", "00000000-0000-0000-0000-000000020042", "00000000-0000-0000-0000-000000030041", "00000000-0000-0000-0000-000000030042", "00000000-0000-0000-0000-000000030043"],
    ["tea", "00000000-0000-0000-0000-000000010005", "00000000-0000-0000-0000-000000020051", "00000000-0000-0000-0000-000000020052", "00000000-0000-0000-0000-000000030051", "00000000-0000-0000-0000-000000030052", "00000000-0000-0000-0000-000000030053"],
    ["piz", "00000000-0000-0000-0000-000000010006", "00000000-0000-0000-0000-000000020061", "00000000-0000-0000-0000-000000020062", "00000000-0000-0000-0000-000000030061", "00000000-0000-0000-0000-000000030062", "00000000-0000-0000-0000-000000030063"]
  ];
  const rows = [];
  let counter = 4011;
  const roleId = () => `00000000-0000-0000-0000-${String(counter++).padStart(12, "0")}`;
  for (const [, tenantId, branchA, branchB, ownerId, managerId, staffId] of pairs) {
    rows.push({ id: roleId(), user_id: ownerId, tenant_id: tenantId, branch_id: branchA, role: "owner", is_default: true });
    rows.push({ id: roleId(), user_id: ownerId, tenant_id: tenantId, branch_id: branchB, role: "owner", is_default: false });
    rows.push({ id: roleId(), user_id: managerId, tenant_id: tenantId, branch_id: branchA, role: "manager", is_default: true });
    rows.push({ id: roleId(), user_id: managerId, tenant_id: tenantId, branch_id: branchB, role: "manager", is_default: false });
    rows.push({ id: roleId(), user_id: staffId, tenant_id: tenantId, branch_id: branchA, role: "staff", is_default: true });
  }
  return rows;
}

const DEMO_ROLES_ALL = [...DEMO_ROLE_ROWS, ...createAdditionalRoles()];
const DEMO_OWNER_EMPLOYEE_CODE = "182536";

function defaultPositionTitle(role) {
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  if (role === "accountant") return "Accountant";
  return "Staff";
}

function demoEmployeeCodeForRole(role, userId) {
  if (role === "owner") return DEMO_OWNER_EMPLOYEE_CODE;
  const suffix = String(userId).replace(/-/g, "").slice(-6).toUpperCase();
  if (role === "manager") return `MGR-${suffix}`;
  if (role === "accountant") return `ACC-${suffix}`;
  return `STF-${suffix}`;
}

function buildDemoPosUserProfiles(roleRows) {
  const byTenantUser = new Map();
  for (const row of roleRows) {
    const key = `${row.tenant_id}:${row.user_id}`;
    const current = byTenantUser.get(key);
    if (!current || row.is_default || current.role === "staff") {
      byTenantUser.set(key, {
        tenant_id: row.tenant_id,
        user_id: row.user_id,
        role: row.role
      });
    }
  }

  return Array.from(byTenantUser.values()).map((row) => ({
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    employee_code: demoEmployeeCodeForRole(row.role, row.user_id),
    position_title: defaultPositionTitle(row.role),
    permission_role: row.role
  }));
}

const USER_PASSWORDS = {
  "owner@noodle.local": "Owner#1234",
  "manager@noodle.local": "Manager#1234",
  "staff@noodle.local": "Staff#1234",
  "owner.caf@demo.local": "Owner#2026",
  "manager.caf@demo.local": "Manager#2026",
  "staff.caf@demo.local": "Staff#2026",
  "owner.bbq@demo.local": "Owner#2026",
  "manager.bbq@demo.local": "Manager#2026",
  "staff.bbq@demo.local": "Staff#2026",
  "owner.sfd@demo.local": "Owner#2026",
  "manager.sfd@demo.local": "Manager#2026",
  "staff.sfd@demo.local": "Staff#2026",
  "owner.bak@demo.local": "Owner#2026",
  "manager.bak@demo.local": "Manager#2026",
  "staff.bak@demo.local": "Staff#2026",
  "owner.tea@demo.local": "Owner#2026",
  "manager.tea@demo.local": "Manager#2026",
  "staff.tea@demo.local": "Staff#2026",
  "owner.piz@demo.local": "Owner#2026",
  "manager.piz@demo.local": "Manager#2026",
  "staff.piz@demo.local": "Staff#2026"
};

async function ensureAuthUsers(baseUrl, key, users) {
  const desired = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const byEmail = new Map();
  let page = 1;
  while (true) {
    const list = await authAdminRequest({
      method: "GET",
      url: `${baseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`,
      key
    });
    const rows = Array.isArray(list?.users) ? list.users : [];
    for (const user of rows) {
      const email = String(user?.email ?? "").toLowerCase();
      if (email) byEmail.set(email, String(user.id));
    }
    if (rows.length < 1000) break;
    page += 1;
  }

  for (const [email, spec] of desired.entries()) {
    if (byEmail.has(email)) continue;
    const password = USER_PASSWORDS[email];
    if (!password) {
      throw new Error(`Missing password mapping for auth user: ${email}`);
    }
    const created = await authAdminRequest({
      method: "POST",
      url: `${baseUrl}/auth/v1/admin/users`,
      key,
      body: {
        email: spec.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: spec.full_name }
      }
    });
    const createdId = String(created?.id ?? created?.user?.id ?? "");
    if (!createdId) {
      throw new Error(`Auth user create did not return id for ${email}`);
    }
    byEmail.set(email, createdId);
  }

  return byEmail;
}

const FEATURE_CATALOG_ROWS = [
  {
    code: "core_pos_sales",
    name: "Core POS Sales",
    description: "Core POS sales access",
    default_monthly_price: 0,
    default_yearly_price: 0,
    default_perpetual_price: 0,
    included_by_default: true,
    priced_per_branch: false,
    is_active: true
  },
  {
    code: "staff_card_login",
    name: "Staff Card Login",
    description: "Employee code login access",
    default_monthly_price: 0,
    default_yearly_price: 0,
    default_perpetual_price: 0,
    included_by_default: true,
    priced_per_branch: false,
    is_active: true
  }
];

const PACKAGE_FEATURE_ROWS = [
  { package_id: STARTER_PACKAGE.id, feature_code: "core_pos_sales", included: true },
  { package_id: STARTER_PACKAGE.id, feature_code: "staff_card_login", included: true }
];

const CONTRACT_ROWS = DEMO_TENANTS.map((tenant, index) => ({
  id: `90000000-0000-0000-0000-0000000000${String(index + 1).padStart(2, "0")}`,
  tenant_id: tenant.id,
  package_id: STARTER_PACKAGE.id,
  contract_type: "saas",
  billing_interval: "monthly",
  deployment_mode: "cloud",
  status: "active",
  branch_limit: 5,
  terminal_limit_per_branch: 5,
  amount_per_cycle: 0,
  currency: "THB",
  auto_renew: true
}));

const DEVICE_ROWS = DEMO_BRANCHES.flatMap((branch, branchIndex) =>
  [1, 2].map((deviceNumber) => ({
    id: `80000000-0000-0000-0000-00000000${String(branchIndex * 2 + deviceNumber).padStart(4, "0")}`,
    tenant_id: branch.tenant_id,
    branch_id: branch.id,
    device_code: `${branch.code}-POS-${String(deviceNumber).padStart(2, "0")}`,
    device_name: `${branch.code} POS ${String(deviceNumber).padStart(2, "0")}`,
    device_type: "pos_terminal",
    status: "active",
    is_locked: true,
    allow_morning_shift: true,
    allow_afternoon_shift: true,
    metadata: {}
  }))
);

const CHANNEL_ROWS = DEMO_BRANCHES.flatMap((branch, idx) => [
  {
    id: `81000000-0000-0000-0000-00000000${String(idx * 2 + 1).padStart(4, "0")}`,
    tenant_id: branch.tenant_id,
    branch_id: branch.id,
    channel_code: "storefront",
    channel_name: "Storefront",
    is_manual: true,
    is_active: true
  },
  {
    id: `81000000-0000-0000-0000-00000000${String(idx * 2 + 2).padStart(4, "0")}`,
    tenant_id: branch.tenant_id,
    branch_id: branch.id,
    channel_code: "delivery_manual",
    channel_name: "Delivery Manual",
    is_manual: true,
    is_active: true
  }
]);

const PRODUCT_ROWS = DEMO_BRANCHES.flatMap((branch, idx) => [
  {
    id: `82000000-0000-0000-0000-00000000${String(idx * 2 + 1).padStart(4, "0")}`,
    tenant_id: branch.tenant_id,
    branch_id: branch.id,
    sku: `${branch.code}-FOOD-01`,
    name: "Demo Noodle Bowl",
    category: "Main",
    price: 65,
    is_combo: false,
    is_active: true
  },
  {
    id: `82000000-0000-0000-0000-00000000${String(idx * 2 + 2).padStart(4, "0")}`,
    tenant_id: branch.tenant_id,
    branch_id: branch.id,
    sku: `${branch.code}-DRINK-01`,
    name: "Demo Drink",
    category: "Drink",
    price: 25,
    is_combo: false,
    is_active: true
  }
]);

async function deleteByTenantScope(baseUrl, key, table, tenantIds) {
  if (tenantIds.length === 0) return;
  const inFilter = buildInFilter(tenantIds);
  const url = `${baseUrl}/rest/v1/${table}?tenant_id=${inFilter}`;
  try {
    await restRequest({ method: "DELETE", url, key, prefer: "return=minimal" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("relation") && message.includes("does not exist")) return;
    throw error;
  }
}

async function main() {
  const env = await loadEnv();
  const baseUrl = env.supabaseUrl.replace(/\/+$/, "");
  const key = env.serviceRoleKey;

  const tenantIds = DEMO_TENANTS.map((t) => t.id);
  const tenantCodes = DEMO_TENANTS.map((t) => t.code);
  const authUserIdsByEmail = await ensureAuthUsers(baseUrl, key, DEMO_USERS);
  const fixedIdToEmail = new Map(DEMO_USERS.map((u) => [u.id, u.email.toLowerCase()]));
  const usersForUpsert = DEMO_USERS.map((u) => {
    const emailKey = u.email.toLowerCase();
    const authId = authUserIdsByEmail.get(emailKey) ?? u.id;
    return {
      ...u,
      id: authId
    };
  });
  const roleRowsForUpsert = DEMO_ROLES_ALL.map((r) => {
    const emailKey = fixedIdToEmail.get(r.user_id);
    if (!emailKey) return r;
    const authId = authUserIdsByEmail.get(emailKey) ?? r.user_id;
    return { ...r, user_id: authId };
  });
  const posUserProfilesForUpsert = buildDemoPosUserProfiles(roleRowsForUpsert);

  const userIds = usersForUpsert.map((u) => u.id);

  const cleanupTables = [
    "payments",
    "order_items",
    "orders",
    "shifts",
    "stock_movements",
    "pos_sessions",
    "pos_login_contexts",
    "audit_logs",
    "branch_device_shift_sessions",
    "branch_devices",
    "branch_login_policies",
    "product_combo_items",
    "recipes",
    "ingredient_packages",
    "ingredients",
    "products",
    "merchant_channels",
    "table_layout_objects",
    "dining_tables",
    "table_zones",
    "dine_in_tables",
    "pos_user_profiles",
    "user_branch_roles",
    "tenant_feature_subscriptions",
    "tenant_subscription_contracts"
  ];

  for (const table of cleanupTables) {
    await deleteByTenantScope(baseUrl, key, table, tenantIds);
  }

  await restRequest({
    method: "DELETE",
    url: `${baseUrl}/rest/v1/users_profiles?id=${buildInFilter(userIds)}`,
    key,
    prefer: "return=minimal"
  }).catch(() => undefined);

  await restRequest({
    method: "DELETE",
    url: `${baseUrl}/rest/v1/branches?tenant_id=${buildInFilter(tenantIds)}`,
    key,
    prefer: "return=minimal"
  }).catch(() => undefined);

  await restRequest({
    method: "DELETE",
    url: `${baseUrl}/rest/v1/tenants?code=${buildInFilter(tenantCodes)}`,
    key,
    prefer: "return=minimal"
  }).catch(() => undefined);

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/subscription_packages?on_conflict=id`,
    key,
    body: [STARTER_PACKAGE],
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/package_feature_catalog?on_conflict=code`,
    key,
    body: FEATURE_CATALOG_ROWS,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/subscription_package_features?on_conflict=package_id,feature_code`,
    key,
    body: PACKAGE_FEATURE_ROWS,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/tenants?on_conflict=id`,
    key,
    body: DEMO_TENANTS,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/branches?on_conflict=id`,
    key,
    body: DEMO_BRANCHES,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/tenant_subscription_contracts?on_conflict=id`,
    key,
    body: CONTRACT_ROWS,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/users_profiles?on_conflict=id`,
    key,
    body: usersForUpsert,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/user_branch_roles?on_conflict=user_id,tenant_id,branch_id`,
    key,
    body: roleRowsForUpsert,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/pos_user_profiles?on_conflict=tenant_id,user_id`,
    key,
    body: posUserProfilesForUpsert,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/branch_devices?on_conflict=tenant_id,branch_id,device_code`,
    key,
    body: DEVICE_ROWS,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/merchant_channels?on_conflict=tenant_id,branch_id,channel_code`,
    key,
    body: CHANNEL_ROWS,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  await restRequest({
    method: "POST",
    url: `${baseUrl}/rest/v1/products?on_conflict=tenant_id,branch_id,sku`,
    key,
    body: PRODUCT_ROWS,
    prefer: "resolution=merge-duplicates,return=representation"
  });

  const verifyTenants = await restRequest({
    method: "GET",
    url: `${baseUrl}/rest/v1/tenants?select=id,code,name&code=${buildInFilter(tenantCodes)}`,
    key
  });
  const verifyBranches = await restRequest({
    method: "GET",
    url: `${baseUrl}/rest/v1/branches?select=id,tenant_id,code,name&tenant_id=${buildInFilter(tenantIds)}`,
    key
  });
  const verifyDevices = await restRequest({
    method: "GET",
    url: `${baseUrl}/rest/v1/branch_devices?select=id,branch_id,device_code&tenant_id=${buildInFilter(tenantIds)}`,
    key
  });

  console.log(
    JSON.stringify(
      {
        envSource: env.source,
        tenantCount: Array.isArray(verifyTenants) ? verifyTenants.length : 0,
        branchCount: Array.isArray(verifyBranches) ? verifyBranches.length : 0,
        deviceCount: Array.isArray(verifyDevices) ? verifyDevices.length : 0,
        storeCodes: tenantCodes
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
