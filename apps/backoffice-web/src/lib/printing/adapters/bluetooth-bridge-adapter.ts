import { readEnv } from "@/lib/env";
import type { PrinterAdapter } from "@/lib/printing/adapters/types";

function readMetadataText(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export class BluetoothBridgeAdapter implements PrinterAdapter {
  readonly connectionType = "BLUETOOTH_BRIDGE" as const;

  async print(ctx: Parameters<PrinterAdapter["print"]>[0]) {
    const bridgeUrlFromEnv = readEnv("PRINT_BLUETOOTH_BRIDGE_URL") ?? readEnv("PRINT_BRIDGE_URL");
    const bridgeUrl = readMetadataText(ctx.metadata, "bridge_url") ?? bridgeUrlFromEnv;
    if (!bridgeUrl) {
      throw new Error("BLUETOOTH_BRIDGE requires metadata.bridge_url or PRINT_BLUETOOTH_BRIDGE_URL.");
    }

    const bluetoothAddress =
      readMetadataText(ctx.metadata, "bluetooth_address") ??
      readMetadataText(ctx.metadata, "bluetooth_mac") ??
      readMetadataText(ctx.metadata, "bt_address");
    const bluetoothName =
      readMetadataText(ctx.metadata, "bluetooth_name") ??
      readMetadataText(ctx.metadata, "device_name");
    const payloadHtml = ctx.payloadHtml ?? readMetadataText(ctx.metadata, "payload_html");
    const autoConnect = ctx.metadata.auto_connect !== false;

    if (!bluetoothAddress && !bluetoothName) {
      throw new Error("BLUETOOTH_BRIDGE requires metadata.bluetooth_address or metadata.bluetooth_name.");
    }

    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        printer_id: ctx.printerId,
        printer_name: ctx.printerName,
        connection_type: ctx.connectionType,
        payload_text: ctx.payloadText,
        payload_html: payloadHtml,
        metadata: {
          ...ctx.metadata,
          transport: "bluetooth",
          print_format: payloadHtml ? "html_58mm" : "text",
          auto_connect: autoConnect,
          connect_before_print: autoConnect,
          bluetooth_address: bluetoothAddress,
          bluetooth_name: bluetoothName
        }
      })
    });

    if (!response.ok) {
      throw new Error(`BLUETOOTH_BRIDGE request failed with status ${response.status}.`);
    }

    return {
      metadata: {
        bridge_url: bridgeUrl,
        bluetooth_address: bluetoothAddress,
        bluetooth_name: bluetoothName,
        auto_connect: autoConnect,
        sent_as_html: Boolean(payloadHtml)
      }
    };
  }
}
