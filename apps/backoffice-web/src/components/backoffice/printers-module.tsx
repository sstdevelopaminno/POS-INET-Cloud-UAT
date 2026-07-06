"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/backoffice/list-state";
import { PaginationControls } from "@/components/backoffice/pagination-controls";
import { usePaginatedApi } from "@/components/backoffice/use-paginated-api";

type PrinterRow = {
  id: string;
  printer_name: string;
  printer_role: "receipt" | "kitchen" | "report";
  connection_type: "NETWORK_ESC_POS" | "STAR_WEBPRNT" | "LOCAL_BRIDGE" | "BLUETOOTH_BRIDGE";
  ip_address: string | null;
  port: number | null;
  paper_width_mm: 58 | 80;
  enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

type BluetoothDevice = {
  id: string;
  name: string;
  address: string | null;
  rssi: number | null;
  paired: boolean;
  connected: boolean;
};

type BridgeEnvelope<TData> = {
  ok: boolean;
  code: string;
  message: string;
  action: string;
  timestamp: string;
  data: TData;
};

type BridgeDebugEntry = {
  at: string;
  attempts: number;
  request: Record<string, unknown>;
  status: number | null;
  response: unknown;
};

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function prettyJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function PrintersModule() {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<BluetoothDevice[]>([]);

  const [printerName, setPrinterName] = useState("");
  const [printerRole, setPrinterRole] = useState<PrinterRow["printer_role"]>("receipt");
  const [connectionType, setConnectionType] = useState<PrinterRow["connection_type"]>("NETWORK_ESC_POS");
  const [paperWidthMm, setPaperWidthMm] = useState<58 | 80>(58);
  const [ipAddress, setIpAddress] = useState("");
  const [portValue, setPortValue] = useState("");
  const [metadataText, setMetadataText] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [bridgeUrlInput, setBridgeUrlInput] = useState("http://127.0.0.1:3210/print");
  const [bridgeHealth, setBridgeHealth] = useState<{ ok: boolean; code: string; message: string; latencyMs: number | null } | null>(null);
  const [printingBridgeTest, setPrintingBridgeTest] = useState(false);
  const [bridgeDebug, setBridgeDebug] = useState<{
    health: BridgeDebugEntry | null;
    discover: BridgeDebugEntry | null;
    connect: BridgeDebugEntry | null;
    print: BridgeDebugEntry | null;
  }>({
    health: null,
    discover: null,
    connect: null,
    print: null
  });

  const isBluetoothMode = connectionType === "BLUETOOTH_BRIDGE";
  const metadataPlaceholder = useMemo(() => {
    if (connectionType === "STAR_WEBPRNT") {
      return '{"webprnt_url":"http://printer.local/StarWebPRNT/SendMessage"}';
    }
    if (connectionType === "LOCAL_BRIDGE") {
      return '{"bridge_url":"http://127.0.0.1:3210/print"}';
    }
    if (connectionType === "BLUETOOTH_BRIDGE") {
      return '{"bridge_url":"http://127.0.0.1:3210/print","bluetooth_address":"AA:BB:CC:DD:EE:FF","auto_connect":true}';
    }
    return "metadata JSON (optional)";
  }, [connectionType]);

  const { loading, error, items, pagination } = usePaginatedApi<PrinterRow>("/api/backoffice/printers", {
    page,
    page_size: 10,
    reload: reloadKey
  });

  useEffect(() => {
    if (!isBluetoothMode) return;
    let active = true;
    let timer: number | null = null;

    const checkBridgeHealth = async () => {
      const requestPayload = { bridge_url: bridgeUrlInput.trim() || null };
      let attempts = 0;
      let backoffMs = 350;
      try {
        while (attempts < 3) {
          attempts += 1;
          const response = await fetch("/api/backoffice/printers/bluetooth/health", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload)
          });
          const body = (await readJson(response)) as { data?: BridgeEnvelope<{ latency_ms?: number | null }> } | null;
          const envelope = body?.data;
          if (!active || !envelope) return;
          setBridgeDebug((current) => ({
            ...current,
            health: {
              at: new Date().toISOString(),
              attempts,
              request: requestPayload,
              status: response.status,
              response: body
            }
          }));
          setBridgeHealth({
            ok: envelope.ok === true,
            code: envelope.code,
            message: envelope.message,
            latencyMs: Number.isFinite(Number(envelope.data?.latency_ms)) ? Number(envelope.data?.latency_ms) : null
          });
          if (envelope.ok || attempts >= 3) {
            break;
          }
          await sleep(backoffMs);
          backoffMs = Math.min(2200, backoffMs * 2);
        }
      } catch {
        if (!active) return;
        setBridgeHealth({
          ok: false,
          code: "bridge_health_check_failed",
          message: "Bridge health check failed.",
          latencyMs: null
        });
        setBridgeDebug((current) => ({
          ...current,
          health: {
            at: new Date().toISOString(),
            attempts: Math.max(1, attempts),
            request: requestPayload,
            status: null,
            response: { error: "bridge_health_check_failed" }
          }
        }));
      } finally {
        if (!active) return;
        timer = window.setTimeout(checkBridgeHealth, 8000);
      }
    };

    void checkBridgeHealth();
    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [bridgeUrlInput, isBluetoothMode]);

  function applyBluetoothDevice(device: BluetoothDevice) {
    const candidateName = device.name.trim() || device.address || "Bluetooth Printer";
    const metadata = {
      bridge_url: bridgeUrlInput.trim() || "http://127.0.0.1:3210/print",
      bluetooth_address: device.address,
      bluetooth_name: device.name,
      auto_connect: true,
      connect_before_print: true,
      prefer_html_58mm: true,
      paper_width_mm: 58
    };
    setConnectionType("BLUETOOTH_BRIDGE");
    setPaperWidthMm(58);
    setPrinterRole("receipt");
    setPrinterName(candidateName.startsWith("BT ") ? candidateName : `BT ${candidateName}`);
    setIpAddress("");
    setPortValue("");
    setMetadataText(prettyJson(metadata));
    setSubmitSuccess(`Applied Bluetooth device: ${candidateName}`);
  }

  async function handleDiscoverBluetooth() {
    setDiscovering(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const requestPayload = {
        bridge_url: bridgeUrlInput.trim() || null,
        timeout_ms: 9000
      };
      const response = await fetch("/api/backoffice/printers/bluetooth/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });
      const body = await readJson(response);
      setBridgeDebug((current) => ({
        ...current,
        discover: {
          at: new Date().toISOString(),
          attempts: 1,
          request: requestPayload,
          status: response.status,
          response: body
        }
      }));
      if (!response.ok || body?.error) {
        throw new Error(body?.error?.message ?? "Bluetooth discovery failed.");
      }
      const envelope = body?.data as BridgeEnvelope<{ bridge_url?: string; devices?: BluetoothDevice[] }> | undefined;
      const devices = Array.isArray(envelope?.data?.devices) ? envelope!.data.devices! : [];
      setDiscoveredDevices(devices);
      if (typeof envelope?.data?.bridge_url === "string" && envelope.data.bridge_url.trim().length > 0) {
        setBridgeUrlInput(envelope.data.bridge_url.trim());
      }
      setSubmitSuccess(`${envelope?.message ?? "Discovery done."} Found ${devices.length} device(s).`);
    } catch (discoverError) {
      setDiscoveredDevices([]);
      setSubmitError(discoverError instanceof Error ? discoverError.message : "Unknown error");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleConnectBluetooth(device: BluetoothDevice) {
    setConnectingDeviceId(device.id);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const requestPayload = {
        bridge_url: bridgeUrlInput.trim() || null,
        bluetooth_address: device.address,
        bluetooth_name: device.name,
        auto_connect: true
      };
      let response: Response | null = null;
      let body: unknown = null;
      let envelope: BridgeEnvelope<Record<string, unknown>> | undefined;
      let attempts = 0;
      let backoffMs = 450;

      while (attempts < 3) {
        attempts += 1;
        response = await fetch("/api/backoffice/printers/bluetooth/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload)
        });
        body = await readJson(response);
        envelope = (body as { data?: BridgeEnvelope<Record<string, unknown>> } | null)?.data;
        setBridgeDebug((current) => ({
          ...current,
          connect: {
            at: new Date().toISOString(),
            attempts,
            request: requestPayload,
            status: response?.status ?? null,
            response: body
          }
        }));

        const hasValidationError = response.status === 403 || response.status === 422;
        const isSuccess = response.ok && !(body as { error?: unknown } | null)?.error && envelope?.ok !== false;
        if (isSuccess) {
          break;
        }
        if (attempts >= 3 || hasValidationError) {
          throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? envelope?.message ?? "Bluetooth connect failed.");
        }
        await sleep(backoffMs);
        backoffMs = Math.min(2400, backoffMs * 2);
      }

      applyBluetoothDevice(device);
      setSubmitSuccess(envelope?.message ?? `Bluetooth connected: ${device.name || device.address || "device"}`);
    } catch (connectError) {
      setSubmitError(connectError instanceof Error ? connectError.message : "Unknown error");
    } finally {
      setConnectingDeviceId(null);
    }
  }

  async function handleBridgePrint58Debug() {
    setPrintingBridgeTest(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    const sampleHtml = `<!doctype html><html><head><meta charset="utf-8"/><style>@page{size:58mm 120mm;margin:0}html,body{width:58mm;margin:0;padding:0;font-family:Tahoma,sans-serif;font-size:11px}main{padding:2mm}h1{font-size:12px;margin:0 0 2mm}p{margin:0 0 1mm}</style></head><body><main><h1>Bluetooth 58mm Test</h1><p>Bridge test from printer settings.</p><p>${new Date().toISOString()}</p></main></body></html>`;
    const requestPayload = {
      order_id: null,
      order_no: `BT-TEST-${Date.now()}`,
      receipt_html: sampleHtml
    };
    try {
      const response = await fetch("/api/pos/receipts/bluetooth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });
      const body = await readJson(response);
      setBridgeDebug((current) => ({
        ...current,
        print: {
          at: new Date().toISOString(),
          attempts: 1,
          request: requestPayload,
          status: response.status,
          response: body
        }
      }));
      if (!response.ok || (body as { error?: unknown } | null)?.error) {
        throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? "Bluetooth print debug failed.");
      }
      const message = (body as { data?: { message?: string } } | null)?.data?.message ?? "Bluetooth print debug complete.";
      setSubmitSuccess(message);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setPrintingBridgeTest(false);
    }
  }

  async function handleCreatePrinter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    let metadata: Record<string, unknown> = {};
    if (metadataText.trim()) {
      try {
        metadata = JSON.parse(metadataText) as Record<string, unknown>;
      } catch {
        setSubmitError("metadata_json must be a valid JSON object.");
        setSubmitting(false);
        return;
      }
    }

    const payload = {
      printer_name: printerName.trim(),
      printer_role: printerRole,
      connection_type: connectionType,
      ip_address: ipAddress.trim() || null,
      port: Number(portValue || 0) || null,
      paper_width_mm: paperWidthMm,
      enabled,
      metadata
    };

    try {
      const response = await fetch("/api/backoffice/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await readJson(response);
      if (!response.ok || body?.error) {
        throw new Error(body?.error?.message ?? "Create printer failed.");
      }
      setSubmitSuccess(`Printer created: ${body?.data?.printer_name ?? payload.printer_name}`);
      setReloadKey((key) => key + 1);
      setPrinterName("");
      setIpAddress("");
      setPortValue("");
      setMetadataText("");
      setDiscoveredDevices([]);
    } catch (createError) {
      setSubmitError(createError instanceof Error ? createError.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTestPrint(printerId: string) {
    setTestingId(printerId);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const response = await fetch("/api/backoffice/printers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printer_id: printerId })
      });
      const body = await readJson(response);
      if (!response.ok || body?.error) {
        throw new Error(body?.error?.message ?? "Test print failed.");
      }
      setSubmitSuccess(`Test print queued for printer ${printerId}`);
      setReloadKey((key) => key + 1);
    } catch (testError) {
      setSubmitError(testError instanceof Error ? testError.message : "Unknown error");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <section className="surface">
      <h2>Printer Settings</h2>
      <p style={{ color: "var(--muted)" }}>Adapter-based printing supports NETWORK_ESC_POS, STAR_WEBPRNT, LOCAL_BRIDGE, and BLUETOOTH_BRIDGE.</p>

      <form className="grid cols-4" onSubmit={handleCreatePrinter}>
        <input
          name="printer_name"
          value={printerName}
          onChange={(event) => setPrinterName(event.target.value)}
          placeholder="Printer name"
          required
          style={{ minHeight: 42, padding: "8px 10px" }}
        />
        <select name="printer_role" value={printerRole} onChange={(event) => setPrinterRole(event.target.value as PrinterRow["printer_role"])} style={{ minHeight: 42 }}>
          <option value="receipt">receipt</option>
          <option value="kitchen">kitchen</option>
          <option value="report">report</option>
        </select>
        <select
          name="connection_type"
          value={connectionType}
          onChange={(event) => setConnectionType(event.target.value as PrinterRow["connection_type"])}
          style={{ minHeight: 42 }}
        >
          <option value="NETWORK_ESC_POS">NETWORK_ESC_POS</option>
          <option value="STAR_WEBPRNT">STAR_WEBPRNT</option>
          <option value="LOCAL_BRIDGE">LOCAL_BRIDGE</option>
          <option value="BLUETOOTH_BRIDGE">BLUETOOTH_BRIDGE</option>
        </select>
        <select
          name="paper_width_mm"
          value={String(paperWidthMm)}
          onChange={(event) => setPaperWidthMm(Number(event.target.value) === 80 ? 80 : 58)}
          style={{ minHeight: 42 }}
        >
          <option value="58">58mm</option>
          <option value="80">80mm</option>
        </select>
        <input
          name="ip_address"
          value={ipAddress}
          onChange={(event) => setIpAddress(event.target.value)}
          placeholder="ip_address (for network printer)"
          style={{ minHeight: 42, padding: "8px 10px" }}
        />
        <input
          name="port"
          type="number"
          value={portValue}
          onChange={(event) => setPortValue(event.target.value)}
          placeholder="port (default 9100)"
          style={{ minHeight: 42, padding: "8px 10px" }}
        />
        <input
          name="metadata_json"
          value={metadataText}
          onChange={(event) => setMetadataText(event.target.value)}
          placeholder={metadataPlaceholder}
          style={{ minHeight: 42, padding: "8px 10px" }}
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input name="enabled" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Enabled
        </label>
        <button type="submit" disabled={submitting} style={{ minHeight: 42 }}>
          {submitting ? "Saving..." : "Add printer"}
        </button>
      </form>

      {isBluetoothMode ? (
        <section style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
          <h3 style={{ margin: "0 0 8px" }}>Bluetooth Discovery & Auto Connect</h3>
          <div style={{ marginBottom: 8, fontSize: 12, color: bridgeHealth?.ok ? "#067647" : "#b42318" }}>
            Bridge status: {bridgeHealth ? (bridgeHealth.ok ? "online" : "offline") : "checking"}
            {bridgeHealth?.latencyMs != null ? ` (${bridgeHealth.latencyMs}ms)` : ""}
            {bridgeHealth?.message ? ` - ${bridgeHealth.message}` : ""}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input
              value={bridgeUrlInput}
              onChange={(event) => setBridgeUrlInput(event.target.value)}
              placeholder="bridge_url (e.g. http://127.0.0.1:3210/print)"
              style={{ minHeight: 40, padding: "8px 10px" }}
            />
            <button type="button" onClick={() => void handleDiscoverBluetooth()} disabled={discovering} style={{ minHeight: 40, padding: "0 16px" }}>
              {discovering ? "Scanning..." : "Scan Bluetooth"}
            </button>
          </div>
          <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 12 }}>
            Select a device below to auto-fill metadata and auto-connect.
          </p>
          <div style={{ marginTop: 8 }}>
            <button type="button" onClick={() => void handleBridgePrint58Debug()} disabled={printingBridgeTest} style={{ minHeight: 34 }}>
              {printingBridgeTest ? "Testing print..." : "Debug Print 58mm"}
            </button>
          </div>

          {discoveredDevices.length > 0 ? (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Device</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Address</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Status</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {discoveredDevices.map((device) => (
                    <tr key={device.id}>
                      <td style={{ borderBottom: "1px solid var(--border)", padding: 8 }}>
                        <strong>{device.name || "-"}</strong>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>RSSI: {device.rssi ?? "-"}</div>
                      </td>
                      <td style={{ borderBottom: "1px solid var(--border)", padding: 8 }}>{device.address ?? "-"}</td>
                      <td style={{ borderBottom: "1px solid var(--border)", padding: 8 }}>
                        {device.connected ? "connected" : "not connected"} / {device.paired ? "paired" : "not paired"}
                      </td>
                      <td style={{ borderBottom: "1px solid var(--border)", padding: 8, display: "flex", gap: 8 }}>
                        <button type="button" onClick={() => applyBluetoothDevice(device)} style={{ minHeight: 34 }}>
                          Use device
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleConnectBluetooth(device)}
                          disabled={connectingDeviceId === device.id}
                          style={{ minHeight: 34 }}
                        >
                          {connectingDeviceId === device.id ? "Connecting..." : "Auto connect"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {isBluetoothMode ? (
        <details style={{ marginTop: 10 }}>
          <summary>Bridge Debug Panel (raw response)</summary>
          <pre style={{ marginTop: 8, maxHeight: 260, overflow: "auto", background: "#f8fafc", border: "1px solid var(--border)", padding: 10, borderRadius: 8 }}>
            {JSON.stringify(bridgeDebug, null, 2)}
          </pre>
        </details>
      ) : null}

      <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
        <p style={{ margin: "0 0 6px" }}>Bluetooth metadata examples:</p>
        <p style={{ margin: "0 0 4px" }}>
          <code>{'{"bridge_url":"http://127.0.0.1:3210/print","bluetooth_address":"AA:BB:CC:DD:EE:FF","auto_connect":true}'}</code>
        </p>
        <p style={{ margin: 0 }}>
          <code>{'{"bridge_url":"http://127.0.0.1:3210/print","bluetooth_name":"MTP-II","auto_connect":true}'}</code>
        </p>
      </div>

      {submitError ? <ErrorState message={submitError} /> : null}
      {submitSuccess ? <p style={{ color: "#067647" }}>{submitSuccess}</p> : null}

      {loading ? <LoadingState label="Loading printers..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState label="No printers configured yet." /> : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Name</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Role</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Connection</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Address</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Paper</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Enabled</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((printer) => (
                  <tr key={printer.id}>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: 8 }}>{printer.printer_name}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: 8 }}>{printer.printer_role}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: 8 }}>{printer.connection_type}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: 8 }}>
                      {printer.ip_address ? `${printer.ip_address}:${printer.port ?? 9100}` : "-"}
                    </td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: 8 }}>{printer.paper_width_mm}mm</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: 8 }}>{printer.enabled ? "yes" : "no"}</td>
                    <td style={{ borderBottom: "1px solid var(--border)", padding: 8 }}>
                      <button type="button" disabled={testingId === printer.id} onClick={() => handleTestPrint(printer.id)} style={{ minHeight: 36 }}>
                        {testingId === printer.id ? "Testing..." : "Test print"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10 }}>
            <PaginationControls page={pagination.page} totalPages={pagination.total_pages} onPageChange={setPage} />
          </div>
        </>
      ) : null}
    </section>
  );
}
