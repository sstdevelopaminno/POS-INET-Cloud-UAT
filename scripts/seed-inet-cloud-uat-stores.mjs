import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bridgePackageUrl = pathToFileURL(join(root, "apps", "inet-payment-bridge", "package.json"));
const bridgeRequire = createRequire(bridgePackageUrl);

function requireBridgeDependency(name) {
  try {
    return bridgeRequire(name);
  } catch (error) {
    console.error(`Missing dependency "${name}". Run: npm.cmd --prefix apps/inet-payment-bridge install`);
    throw error;
  }
}

const { Client } = requireBridgeDependency("pg");
const bcrypt = requireBridgeDependency("bcryptjs");
const dotenv = requireBridgeDependency("dotenv");

const bridgeEnvPath = join(root, "apps", "inet-payment-bridge", ".env");
if (existsSync(bridgeEnvPath)) {
  dotenv.config({ path: bridgeEnvPath });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing DATABASE_URL. Set it in apps/inet-payment-bridge/.env or current PowerShell session.");
  process.exit(1);
}

const stores = [
  {
    code: "NDL-TH-001",
    name: "NDL Thailand",
    ownerName: "NDL Owner",
    branches: [
      { code: "ONNUT", name: "อ่อนนุช", address: "อ่อนนุช", deviceCode: "NDL-ONNUT-POS-01" },
      { code: "PETCHBURI", name: "ถนนเพชรบุรี", address: "ถนนเพชรบุรี", deviceCode: "NDL-PETCHBURI-POS-01" }
    ],
    users: [
      {
        employeeCode: "SST182536",
        fullName: "NDL Owner",
        pin: "182536",
        role: "owner",
        positionTitle: "เจ้าของร้าน"
      },
      {
        employeeCode: "NTI-225569",
        fullName: "NDL Manager",
        pin: "503202",
        role: "manager",
        positionTitle: "ผู้จัดการ"
      }
    ]
  },
  {
    code: "BBQ-TH-002",
    name: "BBQ Thailand",
    ownerName: "BBQ Owner",
    branches: [
      { code: "MOO-UAN-YENTAFO", name: "หมูอ้วนเย็นตาโฟ", address: "หมูอ้วนเย็นตาโฟ", deviceCode: "BBQ-POS-01" }
    ],
    users: [
      {
        employeeCode: "Kk112233",
        fullName: "BBQ Owner",
        pin: "123456",
        role: "owner",
        positionTitle: "เจ้าของร้าน"
      }
    ]
  },
  {
    code: "SOLO-TH-001",
    name: "SOLO POS",
    ownerName: "SOLO Owner",
    branches: [
      { code: "SOLO", name: "SOLO", address: "SOLO", deviceCode: "SOLO-POS-01" }
    ],
    users: [
      {
        employeeCode: "900001",
        fullName: "SOLO Owner",
        pin: "111111",
        role: "owner",
        positionTitle: "เจ้าของร้าน"
      },
      {
        employeeCode: "900002",
        fullName: "SOLO Manager",
        pin: "222222",
        role: "manager",
        positionTitle: "ผู้จัดการ"
      },
      {
        employeeCode: "900003",
        fullName: "SOLO Staff",
        pin: "333333",
        role: "staff",
        positionTitle: "พนักงาน"
      }
    ]
  }
];

function deterministicUuid(seed) {
  const hash = createHash("sha256").update(seed).digest();
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function emailFor(storeCode, employeeCode) {
  const local = String(employeeCode).toLowerCase().replace(/[^a-z0-9]+/g, ".");
  return `${local}.${storeCode.toLowerCase()}@inet-cloud-uat.local`;
}

async function upsertTenant(client, store) {
  const result = await client.query(
    `
    insert into tenants (code, name, owner_name, is_active)
    values ($1, $2, $3, true)
    on conflict (code) do update
    set name = excluded.name,
        owner_name = excluded.owner_name,
        is_active = true,
        updated_at = now()
    returning id
    `,
    [store.code, store.name, store.ownerName]
  );
  return result.rows[0].id;
}

async function upsertBranch(client, tenantId, branch) {
  const result = await client.query(
    `
    insert into branches (tenant_id, code, name, address, is_active)
    values ($1, $2, $3, $4, true)
    on conflict (tenant_id, code) do update
    set name = excluded.name,
        address = excluded.address,
        is_active = true,
        updated_at = now()
    returning id
    `,
    [tenantId, branch.code, branch.name, branch.address]
  );
  return result.rows[0].id;
}

async function upsertBranchPolicy(client, tenantId, branchId, maxDevices) {
  await client.query(
    `
    insert into branch_login_policies (
      tenant_id,
      branch_id,
      require_qr_login,
      allow_slip_capture,
      max_devices,
      allow_shared_devices,
      enforce_shift_checkin,
      allow_pin_login,
      allow_staff_card_login,
      require_registered_device
    )
    values ($1, $2, false, true, $3, true, false, true, true, true)
    on conflict (tenant_id, branch_id) do update
    set require_qr_login = false,
        allow_slip_capture = true,
        max_devices = greatest(branch_login_policies.max_devices, excluded.max_devices),
        allow_shared_devices = true,
        enforce_shift_checkin = false,
        allow_pin_login = true,
        allow_staff_card_login = true,
        require_registered_device = true,
        updated_at = now()
    `,
    [tenantId, branchId, Math.max(1, maxDevices)]
  );
}

async function upsertDevice(client, tenantId, branchId, branch) {
  const result = await client.query(
    `
    insert into branch_devices (
      tenant_id,
      branch_id,
      device_code,
      device_name,
      device_type,
      status,
      is_locked,
      allow_morning_shift,
      allow_afternoon_shift,
      metadata
    )
    values ($1, $2, $3, $4, 'pos_terminal', 'active', false, true, true, $5::jsonb)
    on conflict (tenant_id, branch_id, device_code) do update
    set device_name = excluded.device_name,
        device_type = excluded.device_type,
        status = 'active',
        is_locked = false,
        allow_morning_shift = true,
        allow_afternoon_shift = true,
        metadata = excluded.metadata,
        updated_at = now()
    returning id
    `,
    [
      tenantId,
      branchId,
      branch.deviceCode,
      `${branch.name} POS 01`,
      JSON.stringify({
        counter_name: "POS 01",
        location: branch.name,
        provisioned_from: "inet_cloud_uat_seed"
      })
    ]
  );
  return result.rows[0].id;
}

async function upsertUser(client, store, user) {
  const userId = deterministicUuid(`inet-cloud-uat:${store.code}:${user.employeeCode}`);
  const email = emailFor(store.code, user.employeeCode);
  const pinHash = await bcrypt.hash(user.pin, 10);

  await client.query(
    `
    insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
    values ($1, $2, $3::jsonb, $4::jsonb)
    on conflict (id) do update
    set email = excluded.email,
        raw_app_meta_data = excluded.raw_app_meta_data,
        raw_user_meta_data = excluded.raw_user_meta_data,
        updated_at = now()
    `,
    [
      userId,
      email,
      JSON.stringify({ provider: "inet-cloud-uat-seed" }),
      JSON.stringify({ full_name: user.fullName, employee_code: user.employeeCode })
    ]
  );

  await client.query(
    `
    insert into users_profiles (id, email, full_name, platform_role, pin_hash, is_active)
    values ($1, $2, $3, 'tenant_user', $4, true)
    on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        platform_role = 'tenant_user',
        pin_hash = excluded.pin_hash,
        is_active = true,
        updated_at = now()
    `,
    [userId, email, user.fullName, pinHash]
  );

  return userId;
}

async function upsertEmployeeProfile(client, tenantId, userId, user) {
  await client.query(
    `
    insert into pos_user_profiles (tenant_id, user_id, employee_code, position_title, permission_role)
    values ($1, $2, $3, $4, $5)
    on conflict (tenant_id, user_id) do update
    set employee_code = excluded.employee_code,
        position_title = excluded.position_title,
        permission_role = excluded.permission_role,
        updated_at = now()
    `,
    [tenantId, userId, user.employeeCode, user.positionTitle, user.role === "owner" ? "pos_admin" : "pos_user"]
  );
}

async function upsertRoleAndDeviceScope(client, tenantId, branchId, userId, role, isDefault) {
  await client.query(
    `
    insert into user_branch_roles (user_id, tenant_id, branch_id, role, is_default)
    values ($1, $2, $3, $4::branch_role, $5)
    on conflict (user_id, tenant_id, branch_id) do update
    set role = excluded.role,
        is_default = excluded.is_default
    `,
    [userId, tenantId, branchId, role, isDefault]
  );

  await client.query(
    `
    insert into pos_user_device_scopes (tenant_id, branch_id, user_id, scope_mode, device_id)
    values ($1, $2, $3, 'all_devices', null)
    on conflict (tenant_id, branch_id, user_id) do update
    set scope_mode = 'all_devices',
        device_id = null,
        updated_at = now()
    `,
    [tenantId, branchId, userId]
  );
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("begin");

    for (const store of stores) {
      const tenantId = await upsertTenant(client, store);
      const branchIds = [];

      for (const branch of store.branches) {
        const branchId = await upsertBranch(client, tenantId, branch);
        await upsertBranchPolicy(client, tenantId, branchId, store.branches.length);
        await upsertDevice(client, tenantId, branchId, branch);
        branchIds.push(branchId);
      }

      for (const user of store.users) {
        const userId = await upsertUser(client, store, user);
        await upsertEmployeeProfile(client, tenantId, userId, user);
        for (const [index, branchId] of branchIds.entries()) {
          await upsertRoleAndDeviceScope(client, tenantId, branchId, userId, user.role, index === 0);
        }
      }

      console.log(`Seeded ${store.code}: ${store.branches.length} branch(es), ${store.users.length} user(s)`);
    }

    await client.query("commit");

    const summary = await client.query(
      `
      select
        t.code as store_code,
        b.code as branch_code,
        b.name as branch_name,
        bd.device_code,
        p.employee_code,
        up.full_name,
        ubr.role
      from tenants t
      join branches b on b.tenant_id = t.id
      left join branch_devices bd on bd.tenant_id = t.id and bd.branch_id = b.id
      left join user_branch_roles ubr on ubr.tenant_id = t.id and ubr.branch_id = b.id
      left join users_profiles up on up.id = ubr.user_id
      left join pos_user_profiles p on p.tenant_id = t.id and p.user_id = up.id
      where t.code = any($1::text[])
      order by t.code, b.code, ubr.role, p.employee_code
      `,
      [stores.map((store) => store.code)]
    );

    console.table(summary.rows);
    console.log("INET Cloud UAT store seed completed.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
