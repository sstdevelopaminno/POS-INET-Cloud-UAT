export type Tables = {
  tenants: {
    Row: {
      id: string;
      code: string;
      name: string;
      package_id: string | null;
      is_active: boolean;
      created_at: string;
    };
  };
  branches: {
    Row: {
      id: string;
      tenant_id: string;
      code: string;
      name: string;
      is_active: boolean;
      created_at: string;
    };
  };
  orders: {
    Row: {
      id: string;
      tenant_id: string;
      branch_id: string;
      order_no: string;
      order_type: "dine_in" | "takeaway" | "delivery_manual";
      channel: string;
      status: "draft" | "queued" | "preparing" | "completed" | "cancelled";
      total_amount: number;
      created_at: string;
    };
  };
  printer_profiles: {
    Row: {
      id: string;
      tenant_id: string;
      branch_id: string;
      printer_name: string;
      printer_role: "receipt" | "kitchen" | "report";
      connection_type: "NETWORK_ESC_POS" | "STAR_WEBPRNT" | "LOCAL_BRIDGE" | "BLUETOOTH_BRIDGE";
      ip_address: string | null;
      port: number | null;
      paper_width_mm: 58 | 80;
      enabled: boolean;
      metadata: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    };
  };
  print_jobs: {
    Row: {
      id: string;
      tenant_id: string;
      branch_id: string;
      order_id: string | null;
      printer_id: string | null;
      printer_role: "receipt" | "kitchen" | "report";
      connection_type: "NETWORK_ESC_POS" | "STAR_WEBPRNT" | "LOCAL_BRIDGE" | "BLUETOOTH_BRIDGE";
      status: "pending" | "printing" | "printed" | "failed" | "retrying";
      payload_text: string;
      payload_json: Record<string, unknown>;
      retry_count: number;
      max_retry_count: number;
      last_error: string | null;
      printed_at: string | null;
      failed_at: string | null;
      created_at: string;
      updated_at: string;
      metadata: Record<string, unknown>;
    };
  };
};

