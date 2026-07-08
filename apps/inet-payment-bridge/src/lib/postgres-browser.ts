import { spawnSync } from "node:child_process";
import { findPsql } from "./postgres-health.js";

type BrowserTable = {
  id: string;
  label: string;
  schema: string;
  table: string;
  description: string;
  orderBy?: string;
};

const TABLES: BrowserTable[] = [
  {
    id: "tenants",
    label: "Stores / Tenants",
    schema: "public",
    table: "tenants",
    description: "Store and tenant records",
    orderBy: "created_at"
  },
  {
    id: "branches",
    label: "Branches",
    schema: "public",
    table: "branches",
    description: "Store branches",
    orderBy: "created_at"
  },
  {
    id: "users_profiles",
    label: "Users",
    schema: "public",
    table: "users_profiles",
    description: "User profiles",
    orderBy: "created_at"
  },
  {
    id: "user_branch_roles",
    label: "User Branch Roles",
    schema: "public",
    table: "user_branch_roles",
    description: "User roles by branch"
  },
  {
    id: "orders",
    label: "Sales Orders",
    schema: "public",
    table: "orders",
    description: "Sales orders and bills",
    orderBy: "created_at"
  },
  {
    id: "order_items",
    label: "Order Items",
    schema: "public",
    table: "order_items",
    description: "Items inside sales orders",
    orderBy: "created_at"
  },
  {
    id: "pos_payment_intents",
    label: "Payments",
    schema: "public",
    table: "pos_payment_intents",
    description: "Payment intents and INET QR records",
    orderBy: "created_at"
  },
  {
    id: "products",
    label: "Products",
    schema: "public",
    table: "products",
    description: "Product records",
    orderBy: "created_at"
  },
  {
    id: "product_categories",
    label: "Product Categories",
    schema: "public",
    table: "product_categories",
    description: "Product category records",
    orderBy: "created_at"
  },
  {
    id: "shifts",
    label: "Shifts",
    schema: "public",
    table: "shifts",
    description: "POS shift cycles",
    orderBy: "created_at"
  },
  {
    id: "pos_sessions",
    label: "Session POS",
    schema: "public",
    table: "pos_sessions",
    description: "POS login sessions",
    orderBy: "created_at"
  },
  {
    id: "audit_logs",
    label: "Audit log",
    schema: "public",
    table: "audit_logs",
    description: "System audit log records",
    orderBy: "created_at"
  },
  {
    id: "auth_users",
    label: "Auth users",
    schema: "auth",
    table: "users",
    description: "Auth compatibility table"
  }
];

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function literal(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdent(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error("invalid_identifier");
  }
  return `"${value}"`;
}

function safeDetail(value: string) {
  return value.replaceAll(env("DATABASE_URL"), "[DATABASE_URL]").trim().slice(0, 500);
}

function runJsonQuery(sql: string) {
  const databaseUrl = env("DATABASE_URL");
  if (!databaseUrl) {
    return {
      ok: false,
      error: "database_url_missing"
    };
  }

  const result = spawnSync(
    findPsql(),
    ["-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql, databaseUrl],
    {
      encoding: "utf8",
      timeout: 10000
    }
  );

  if (result.error) {
    return {
      ok: false,
      error: "psql_spawn_failed",
      detail: result.error.message
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: "psql_query_failed",
      detail: safeDetail(result.stderr || result.stdout || "psql exited with a non-zero status")
    };
  }

  const line = result.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) {
    return {
      ok: false,
      error: "empty_query_result"
    };
  }

  try {
    return {
      ok: true,
      data: JSON.parse(line) as unknown
    };
  } catch {
    return {
      ok: false,
      error: "invalid_json_result",
      detail: line.slice(0, 500)
    };
  }
}

export function listBrowserTables() {
  return TABLES.map(({ id, label, description, schema, table }) => ({
    id,
    label,
    description,
    schema,
    table
  }));
}

export function readBrowserTable(tableId: string, limitValue?: string, offsetValue?: string) {
  const definition = TABLES.find((table) => table.id === tableId);
  if (!definition) {
    return {
      ok: false,
      error: "unknown_table"
    };
  }

  const limit = Math.min(Math.max(Number(limitValue || 100) || 100, 1), 200);
  const offset = Math.max(Number(offsetValue || 0) || 0, 0);
  const qualified = `${quoteIdent(definition.schema)}.${quoteIdent(definition.table)}`;
  const orderBy = definition.orderBy ? ` order by ${quoteIdent(definition.orderBy)} desc nulls last` : "";
  const schema = literal(definition.schema);
  const table = literal(definition.table);

  const sql = `
with table_exists as (
  select to_regclass(${literal(`${definition.schema}.${definition.table}`)}) is not null as exists
),
column_data as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', column_name,
        'type', data_type,
        'nullable', is_nullable = 'YES'
      )
      order by ordinal_position
    ),
    '[]'::jsonb
  ) as columns
  from information_schema.columns
  where table_schema = ${schema}
    and table_name = ${table}
),
row_data as (
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as rows
  from (
    select *
    from ${qualified}
    ${orderBy}
    limit ${limit}
    offset ${offset}
  ) rows
),
total_data as (
  select count(*)::int as total
  from ${qualified}
)
select jsonb_build_object(
  'id', ${literal(definition.id)},
  'label', ${literal(definition.label)},
  'description', ${literal(definition.description)},
  'schema', ${schema},
  'table', ${table},
  'exists', (select exists from table_exists),
  'columns', (select columns from column_data),
  'rows', (select rows from row_data),
  'total', (select total from total_data),
  'limit', ${limit},
  'offset', ${offset}
)::text;
`;

  return runJsonQuery(sql);
}
