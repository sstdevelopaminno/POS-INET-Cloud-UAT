import { requireItAdmin, guardItAdminError } from "@/lib/it-admin-guard";
import { ok } from "@/lib/http";

export async function GET() {
  try {
    const { supabase } = await requireItAdmin();

    const { data: tenants, error } = await supabase
      .from("tenants")
      .select("id,code,name,is_active,package_id,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const tenantIds = (tenants ?? []).map((item) => item.id);

    const [{ data: branches }, { data: sessions }] = await Promise.all([
      tenantIds.length > 0
        ? supabase.from("branches").select("tenant_id,id").in("tenant_id", tenantIds)
        : Promise.resolve({ data: [], error: null }),
      tenantIds.length > 0
        ? supabase.from("pos_sessions").select("tenant_id,id,status,expires_at").in("tenant_id", tenantIds).eq("status", "active")
        : Promise.resolve({ data: [], error: null })
    ]);

    const nowIso = new Date().toISOString();
    const branchCountByTenant = new Map<string, number>();
    const activeSessionCountByTenant = new Map<string, number>();

    for (const row of branches ?? []) {
      const key = String(row.tenant_id);
      branchCountByTenant.set(key, (branchCountByTenant.get(key) ?? 0) + 1);
    }

    for (const row of sessions ?? []) {
      if (String(row.expires_at) <= nowIso) continue;
      const key = String(row.tenant_id);
      activeSessionCountByTenant.set(key, (activeSessionCountByTenant.get(key) ?? 0) + 1);
    }

    return ok({
      tenants: (tenants ?? []).map((tenant) => ({
        ...tenant,
        branch_count: branchCountByTenant.get(tenant.id) ?? 0,
        active_session_count: activeSessionCountByTenant.get(tenant.id) ?? 0
      }))
    });
  } catch (error) {
    return guardItAdminError(error);
  }
}
