import type { PrinterAdapter } from "@/lib/printing/adapters/types";
import { readEnv } from "@/lib/env";

export class LocalBridgeAdapter implements PrinterAdapter {
  readonly connectionType = "LOCAL_BRIDGE" as const;

  async print(ctx: Parameters<PrinterAdapter["print"]>[0]) {
    const envBridgeUrl = readEnv("PRINT_BRIDGE_URL");
    const bridgeUrl =
      typeof ctx.metadata.bridge_url === "string"
        ? ctx.metadata.bridge_url
        : typeof envBridgeUrl === "string"
          ? envBridgeUrl
          : null;

    if (!bridgeUrl) {
      throw new Error("LOCAL_BRIDGE requires metadata.bridge_url or PRINT_BRIDGE_URL.");
    }

    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        printer_id: ctx.printerId,
        printer_name: ctx.printerName,
        payload_text: ctx.payloadText,
        payload_html: ctx.payloadHtml ?? null,
        metadata: ctx.metadata
      })
    });

    if (!response.ok) {
      throw new Error(`LOCAL_BRIDGE request failed with status ${response.status}.`);
    }

    return {
      metadata: {
        bridge_url: bridgeUrl
      }
    };
  }
}
