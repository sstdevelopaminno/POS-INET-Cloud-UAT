import { Buffer } from "node:buffer";

import { getAuthContext } from "@/lib/auth-context";
import { readEnv } from "@/lib/env";
import { fail, ok } from "@/lib/http";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";

export const runtime = "nodejs";

type ScannedProduct = {
  name: string;
  category: string;
  price: number;
  delivery_price: number;
  stock_quantity: number;
};

type ScannedIngredient = {
  name: string;
  base_unit: string;
  quantity_on_hand: number;
  reorder_level: number;
};

const DEFAULT_OCR_MODEL = readEnv("POS_MENU_OCR_MODEL") ?? "gpt-4o-mini";
const DEFAULT_IMAGE_DETAIL = (readEnv("POS_MENU_SCAN_IMAGE_DETAIL") ?? "low").toLowerCase();
const DEFAULT_MAX_OUTPUT_TOKENS = Math.max(120, Number(readEnv("POS_MENU_SCAN_MAX_OUTPUT_TOKENS") ?? 420));

function parseJsonFromText(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;

    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

function extractOutputText(payload: unknown): string {
  const body = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }

  const chunks: string[] = [];
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function toSafeNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeScannedPayload(payload: Record<string, unknown> | null): {
  products: ScannedProduct[];
  ingredients: ScannedIngredient[];
} {
  const productsRaw = Array.isArray(payload?.products) ? payload.products : [];
  const ingredientsRaw = Array.isArray(payload?.ingredients) ? payload.ingredients : [];

  const products = productsRaw
    .map((row) => {
      const item = row as Record<string, unknown>;
      const name = String(item.name ?? "").trim();
      if (!name) return null;

      const category = String(item.category ?? "").trim();
      const price = Math.max(0, toSafeNumber(item.price, 0));
      const deliveryPrice = Math.max(0, toSafeNumber(item.delivery_price, price));
      const stockQuantity = Math.max(0, Math.round(toSafeNumber(item.stock_quantity, 0)));

      return {
        name,
        category,
        price,
        delivery_price: deliveryPrice,
        stock_quantity: stockQuantity
      } satisfies ScannedProduct;
    })
    .filter((row): row is ScannedProduct => Boolean(row));

  const ingredients = ingredientsRaw
    .map((row) => {
      const item = row as Record<string, unknown>;
      const name = String(item.name ?? "").trim();
      if (!name) return null;

      return {
        name,
        base_unit: String(item.base_unit ?? "gram").trim() || "gram",
        quantity_on_hand: Math.max(0, toSafeNumber(item.quantity_on_hand, 0)),
        reorder_level: Math.max(0, toSafeNumber(item.reorder_level, 0))
      } satisfies ScannedIngredient;
    })
    .filter((row): row is ScannedIngredient => Boolean(row));

  return { products, ingredients };
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    await requirePosApiFeature(auth, "stock_management");

    const verifyMode = (readEnv("POS_MENU_SCAN_MODE") ?? "").toLowerCase();
    const apiKey = readEnv("OPENAI_API_KEY");

    const formData = await req.formData();
    const file = formData.get("menu_image");
    const language = String(formData.get("language") ?? "th").toLowerCase();

    if (!(file instanceof File)) {
      return fail("missing_menu_image", "menu_image is required.", 422);
    }

    if (!file.type.startsWith("image/")) {
      return fail("invalid_file_type", "Menu file must be image.", 422);
    }

    if (file.size > 10 * 1024 * 1024) {
      return fail("file_too_large", "Menu image must be <= 10 MB.", 422);
    }

    if (verifyMode === "mock") {
      return ok({
        products: [
          {
            name: language === "th" ? "เมนูตัวอย่างจากโหมดทดสอบ" : "Sample menu item from mock mode",
            category: language === "th" ? "เมนูสแกน" : "Scanned Menu",
            price: 99,
            delivery_price: 119,
            stock_quantity: 0
          }
        ],
        ingredients: [
          {
            name: language === "th" ? "วัตถุดิบตัวอย่าง" : "Sample ingredient",
            base_unit: "gram",
            quantity_on_hand: 0,
            reorder_level: 0
          }
        ]
      });
    }

    if (!apiKey) {
      return fail(
        "missing_openai_api_key",
        "OPENAI_API_KEY is missing for menu scan OCR. Set OPENAI_API_KEY or POS_MENU_SCAN_MODE=mock for testing.",
        500
      );
    }

    const instruction = [
      "Read the menu image and return JSON only.",
      "JSON shape:",
      "{",
      '  "products":[{"name":"", "category":"", "price":0, "delivery_price":0, "stock_quantity":0}],',
      '  "ingredients":[{"name":"", "base_unit":"gram", "quantity_on_hand":0, "reorder_level":0}]',
      "}",
      "Rules:",
      "- products: sellable menu items",
      "- ingredients: only clearly visible or confidently inferred items",
      "- keep all keys; use 0 for unknown numbers",
      "- output valid JSON only",
      `Preferred language for names: ${language === "th" ? "Thai" : "English"}`
    ].join("\n");

    const arrayBuffer = await file.arrayBuffer();
    const fileBase64 = Buffer.from(arrayBuffer).toString("base64");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_OCR_MODEL,
        max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instruction },
              {
                type: "input_image",
                image_url: `data:${file.type};base64,${fileBase64}`,
                detail: DEFAULT_IMAGE_DETAIL
              }
            ]
          }
        ]
      })
    }).finally(() => clearTimeout(timeout));

    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      const detail =
        typeof payload === "object" && payload !== null && "error" in payload
          ? ((payload as { error?: { message?: string } }).error?.message ?? "OCR request failed.")
          : "OCR request failed.";

      return fail("menu_scan_failed", detail, 400);
    }

    const outputText = extractOutputText(payload);
    const parsedJson = parseJsonFromText(outputText);
    const normalized = normalizeScannedPayload(parsedJson);

    return ok(normalized);
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    if (error instanceof Error && error.name === "AbortError") {
      return fail("menu_scan_timeout", "Menu scan timed out. Please try a smaller/clearer image.", 408);
    }
    return fail("menu_scan_request_failed", error instanceof Error ? error.message : "Menu scan request failed.", 400);
  }
}
