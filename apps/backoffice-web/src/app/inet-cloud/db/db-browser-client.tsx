"use client";

import { FormEvent, useMemo, useState } from "react";

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
  const [tables, setTables] = useState<BrowserTable[]>([]);
  const [activeTable, setActiveTable] = useState("orders");
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [status, setStatus] = useState("Enter the health key, then load data.");
  const [loading, setLoading] = useState(false);

  const visibleColumns = useMemo(() => {
    if (!tableData) return [];
    return tableData.columns.slice(0, 18);
  }, [tableData]);

  async function fetchJson(path: string) {
    const response = await fetch(path, {
      headers: {
        "x-inet-cloud-health-key": key
      },
      cache: "no-store"
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message ?? "Failed to load data.");
    }
    return payload.data;
  }

  async function loadTables() {
    const data = (await fetchJson("/api/inet-cloud/db-browser")) as BrowserTable[];
    setTables(data);
    return data;
  }

  async function loadTable(tableId = activeTable) {
    const data = (await fetchJson(`/api/inet-cloud/db-browser?table=${encodeURIComponent(tableId)}&limit=100`)) as TableData;
    setActiveTable(tableId);
    setTableData(data);
    setStatus(`Loaded ${data.label}: ${data.rows.length}/${data.total} rows`);
  }

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("Connecting to INET Cloud DB...");
    try {
      const nextTables = await loadTables();
      const first = nextTables.find((table) => table.id === activeTable)?.id ?? nextTables[0]?.id ?? "orders";
      await loadTable(first);
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

  return (
    <main className="h-screen overflow-hidden bg-[#f5f7fb] text-[#1b2430]">
      <div className="grid h-full grid-rows-[auto_1fr]">
        <header className="border-b border-[#d7dde8] bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">INET Cloud DB Viewer</h1>
              <p className="text-sm text-[#607086]">Read-only table view for UAT development team</p>
            </div>
            <form className="flex min-w-[320px] gap-2" onSubmit={handleConnect}>
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
                Load data
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
                  <div className="text-xs text-[#6f7f95]">{status}</div>
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
