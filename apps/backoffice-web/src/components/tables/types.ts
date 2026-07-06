import type { FloorPlanObjectType, TableShape, TableStatus } from "@pos/shared-types";

export type TableZoneItem = {
  id: string;
  branch_id?: string | null;
  zone_name: string;
  color: string;
  display_order: number;
  is_active: boolean;
};

export type DiningTableItem = {
  id: string;
  branch_id?: string | null;
  zone_id: string | null;
  table_code: string;
  table_name: string | null;
  capacity: number;
  status: TableStatus;
  shape: TableShape;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  is_active: boolean;
  metadata?: Record<string, unknown>;
  active_session_id?: string | null;
  active_order_id?: string | null;
};

export type FloorPlanObjectItem = {
  id: string;
  branch_id?: string | null;
  zone_id: string | null;
  object_type: FloorPlanObjectType;
  object_name: string | null;
  color: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  is_active: boolean;
  metadata?: Record<string, unknown>;
};
