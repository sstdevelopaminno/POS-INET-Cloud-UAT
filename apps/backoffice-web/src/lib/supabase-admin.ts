import { createClient } from "@supabase/supabase-js";
import { assertDatabaseTargetUrl, readRequiredEnv } from "@/lib/env";

function createServiceClient() {
  const url = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL", "Missing Supabase service role environment variables.");
  const key = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY", "Missing Supabase service role environment variables.");
  assertDatabaseTargetUrl(url);

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

type ServiceClient = ReturnType<typeof createServiceClient>;

function getCachedServiceClient() {
  const scopedGlobal = globalThis as typeof globalThis & {
    __posSupabaseServiceClient?: ServiceClient;
  };
  return scopedGlobal;
}

export function getSupabaseServiceClient() {
  if (typeof window !== "undefined") {
    throw new Error("Supabase service client can only be used on the server.");
  }

  const cache = getCachedServiceClient();
  if (cache.__posSupabaseServiceClient) {
    return cache.__posSupabaseServiceClient;
  }

  cache.__posSupabaseServiceClient = createServiceClient();
  return cache.__posSupabaseServiceClient;
}
