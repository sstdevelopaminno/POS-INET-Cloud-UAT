import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { store_code?: string } | null;
  const storeCode = String(body?.store_code ?? "").trim().toUpperCase();
  if (!storeCode) {
    return NextResponse.json({ data: null, error: { code: "store_code_required", message: "store_code is required." } }, { status: 400 });
  }

  try {
    const localUrl = new URL("/api/store/resolve", request.url);
    const response = await fetch(localUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_code: storeCode }),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => null);
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    console.error("[pos-auth-store-resolve] proxy failed", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json(
      { data: null, error: { code: "store_lookup_failed", message: "Unable to resolve store at this time." } },
      { status: 500 }
    );
  }
}
