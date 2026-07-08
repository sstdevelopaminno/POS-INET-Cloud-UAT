"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type BrowserTable = {
  id: string;
  label: string;
  description: string;
  schema: string;
  table: string;
};

type Column = {
  name: string;
  type: string;
  nullable: boolean;
};

type TableData = {
  id: string;
  label: string;
  description: string;
  schema: string;
  table: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
};

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function downloadCsv(table: TableData) {
  const headers = table.columns.map((column) => column.name);
  const escape = (value: unknown) => `"${formatCell(value).replaceAll('"', '""')}"`;
  const lines = [
    headers.map(escape).join(","),
    ...table.rows.map((row) => headers.map((header) => escape(row[header])).join(","))
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${table.id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DbBrowserClient() {
  const [key, setKey] = useState("");
  const [connectedKey, setConnectedKey] = useState("");
  const [tables, setTables] = useState<BrowserTable[]>([]);
  const [activeTable, setActiveTable] = useState("orders");
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [status, setStatus] = useState("Enter the health key, then load data.");
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const liveRequestRef = useRef(false);
  const restoredKeyRef = useRef(false);

  const visibleColumns = useMemo(() => {
    if (!tableData) return [];
    return tableData.columns.slice(0, 18);
  }, [tableData]);

  const fetchJson = useCallback(async (path: string, authKey = connectedKey || key) => {
    const response = await fetch(path, {
      headers: {
        "x-inet-cloud-health-key": authKey
      },
      cache: "no-store"
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message ?? "Failed to load data.");
    }
    return payload.data;
  }, [connectedKey, key]);

  const formatUpdatedAt = useCallback((date: Date) => {
    return date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }, []);

  const loadTables = useCallback(async (authKey = connectedKey || key) => {
    const data = (await fetchJson("/api/inet-cloud/db-browser", authKey)) as BrowserTable[];
    setTables(data);
    return data;
  }, [connectedKey, fetchJson, key]);

  const loadTable = useCallback(async (tableId = activeTable, authKey = connectedKey || key, silent = false) => {
    const data = (await fetchJson(`/api/inet-cloud/db-browser?table=${encodeURIComponent(tableId)}&limit=100`, authKey)) as TableData;
    const updatedAt = new Date();
    setActiveTable(tableId);
    setTableData(data);
    setLastUpdated(updatedAt);
    setStatus(`${silent ? "Live" : "Loaded"} ${data.label}: ${data.rows.length}/${data.total} rows at ${formatUpdatedAt(updatedAt)}`);
  }, [activeTable, connectedKey, fetchJson, formatUpdatedAt, key]);

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("Connecting to INET Cloud DB...");
    try {
      const authKey = key.trim();
      const nextTables = await loadTables(authKey);
      const first = nextTables.find((table) => table.id === activeTable)?.id ?? nextTables[0]?.id ?? "orders";
      await loadTable(first, authKey);
      setConnectedKey(authKey);
      window.localStorage.setItem("inet-cloud-db-health-key", authKey);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Connection failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(tableId: string) {
    setLoading(true);
    setStatus("Loading table...");
    try {
      await loadTable(tableId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load table.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (restoredKeyRef.current) return;
    restoredKeyRef.current = true;

    const savedKey = window.localStorage.getItem("inet-cloud-db-health-key");
    if (savedKey) {
      setKey(savedKey);
      setConnectedKey(savedKey);
      setStatus("Loading saved INET Cloud DB connection...");
      void (async () => {
        try {
          const nextTables = await loadTables(savedKey);
          const first = nextTables.find((table) => table.id === activeTable)?.id ?? nextTables[0]?.id ?? "orders";
          await loadTable(first, savedKey);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Connection failed.");
        }
      })();
    }
  }, [activeTable, loadTable, loadTables]);

  useEffect(() => {
    if (!live || !connectedKey || !activeTable) return;

    const timer = window.setInterval(() => {
      if (document.hidden || liveRequestRef.current) return;
      liveRequestRef.current = true;
      void loadTable(activeTable, connectedKey, true)
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Live refresh failed.";
          setStatus(`Live refresh failed: ${message}. Retrying...`);
        })
        .finally(() => {
          liveRequestRef.current = false;
        });
    }, 3000);

    return () => window.clearInterval(timer);
  }, [activeTable, connectedKey, live, loadTable]);

  return (
    <main className="h-screen overflow-hidden bg-[#f5f7fb] text-[#1b2430]">
      <div className="grid h-full grid-rows-[auto_1fr]">
        <header className="border-b border-[#d7dde8] bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">INET Cloud DB Viewer</h1>
              <p className="text-sm text-[#607086]">Read-only table view for UAT development team</p>
            </div>
            <form className="flex min-w-[420px] flex-wrap justify-end gap-2" onSubmit={handleConnect}>
              <input
                className="h-10 min-w-0 flex-1 rounded border border-[#c6ceda] px-3 text-sm outline-none focus:border-[#2563eb]"
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="INET Cloud health key"
              />
              <button
                className="h-10 rounded bg-[#2563eb] px-4 text-sm font-medium text-white disabled:opacity-50"
                disabled={loading || !key.trim()}
                type="submit"
              >
                {loading ? "Loading..." : "Load data"}
              </button>
              <button
                className={`h-10 rounded border px-3 text-sm font-medium ${
                  live
                    ? "border-[#2563eb] bg-[#eff6ff] text-[#174ea6]"
                    : "border-[#c6ceda] bg-white text-[#344256]"
                }`}
                onClick={() => setLive((current) => !current)}
                type="button"
              >
                Live {live ? "ON" : "OFF"}
              </button>
            </form>
          </div>
        </header>

        <section className="grid min-h-0 grid-cols-[280px_1fr]">
          <aside className="min-h-0 overflow-y-auto border-r border-[#d7dde8] bg-white p-3">
            <div className="mb-2 px-2 text-xs font-semibold uppercase text-[#708198]">Tables</div>
            <div className="grid gap-1">
              {tables.map((table) => (
                <button
                  className={`rounded px-3 py-2 text-left text-sm ${
                    activeTable === table.id
                      ? "bg-[#e8f0ff] text-[#174ea6]"
                      : "text-[#253246] hover:bg-[#f0f3f8]"
                  }`}
                  key={table.id}
                  onClick={() => handleSelect(table.id)}
                  type="button"
                >
                  <span className="block font-medium">{table.label}</span>
                  <span className="block truncate text-xs text-[#6f7f95]">{table.schema}.{table.table}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="grid min-h-0 grid-rows-[auto_1fr]">
            <div className="border-b border-[#d7dde8] bg-white px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{tableData?.label ?? "No table selected"}</div>
                  <div className="text-xs text-[#6f7f95]">
                    {status}
                    {lastUpdated ? ` | last update ${formatUpdatedAt(lastUpdated)}` : ""}
                  </div>
                </div>
                {tableData ? (
                  <button
                    className="h-9 rounded border border-[#c6ceda] bg-white px-3 text-sm font-medium hover:bg-[#f5f7fb]"
                    onClick={() => downloadCsv(tableData)}
                    type="button"
                  >
                    Export CSV
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 overflow-auto p-4">
              {tableData ? (
                <table className="min-w-full border-separate border-spacing-0 bg-white text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {visibleColumns.map((column) => (
                        <th
                          className="border-b border-r border-[#d7dde8] bg-[#eef2f8] px-3 py-2 text-left text-xs font-semibold text-[#344256]"
                          key={column.name}
                        >
                          {column.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows.map((row, rowIndex) => (
                      <tr className="odd:bg-white even:bg-[#f9fbff]" key={rowIndex}>
                        {visibleColumns.map((column) => (
                          <td
                            className="max-w-[260px] truncate border-b border-r border-[#e3e8f0] px-3 py-2 text-[#243044]"
                            key={column.name}
                            title={formatCell(row[column.name])}
                          >
                            {formatCell(row[column.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex h-full items-center justify-center rounded border border-dashed border-[#bac5d6] bg-white text-sm text-[#6f7f95]">
                  Enter the health key to load read-only table data.
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
