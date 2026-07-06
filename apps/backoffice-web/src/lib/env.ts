function stripTrailingEscapedNewlines(value: string): string {
  return value.replace(/(?:\\r\\n|\\n|\\r)+$/g, "");
}

export function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string") {
    return undefined;
  }

  const normalized = stripTrailingEscapedNewlines(raw.trim());
  return normalized.length > 0 ? normalized : undefined;
}

export function readRequiredEnv(name: string, message?: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(message ?? `Missing required environment variable: ${name}`);
  }

  return value;
}

export function assertDatabaseTargetUrl(url: string) {
  if (readEnv("POS_DATABASE_TARGET") !== "inet_cloud") {
    return;
  }

  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error("Invalid database API URL for INET Cloud database target.");
  }

  const allowSupabaseHost = readEnv("POS_ALLOW_SUPABASE_HOST_FOR_INET_UAT") === "true";
  if (!allowSupabaseHost && (hostname === "supabase.co" || hostname.endsWith(".supabase.co"))) {
    throw new Error("POS-INET-Cloud-UAT is configured for INET Cloud database; refusing Supabase-hosted database URL.");
  }
}
