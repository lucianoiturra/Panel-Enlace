import { boolean, index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

export const cubicles = pgTable("cubicles", {
  id: integer("id").primaryKey(),
  brandModel: text("brand_model").notNull().default(""),
  serialNumber: text("serial_number").notNull().default(""),
  inventoryCode: text("inventory_code").notNull().default(""),
  adminPinStatus: text("admin_pin_status").notNull().default("unreviewed"),
  studentPinStatus: text("student_pin_status").notNull().default("unreviewed"),
  adminPinEncrypted: text("admin_pin_encrypted").notNull().default(""),
  studentPinEncrypted: text("student_pin_encrypted").notNull().default(""),
  internetType: text("internet_type").notNull().default("unreviewed"),
  outletStatus: text("outlet_status").notNull().default("unreviewed"),
  keyboard: text("keyboard").notNull().default("Sin registrar"),
  mouse: text("mouse").notNull().default("Sin registrar"),
  ip: text("ip").notNull().default(""),
  mac: text("mac").notNull().default(""),
  observations: text("observations").notNull().default(""),
  status: text("status").notNull().default("pending"),
  updatedAt: text("updated_at").notNull(),
});

export const appMetadata = pgTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const checklistItems = pgTable("checklist_items", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  createdAt: text("created_at").notNull(),
});

export const stationTasks = pgTable(
  "station_tasks",
  {
    id: serial("id").primaryKey(),
    cubicleId: integer("cubicle_id").notNull(),
    description: text("description").notNull(),
    completed: boolean("completed").notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("task_cubicle_idx").on(table.cubicleId)],
);

export const checklistResults = pgTable(
  "checklist_results",
  {
    id: serial("id").primaryKey(),
    cubicleId: integer("cubicle_id").notNull(),
    itemId: integer("item_id").notNull(),
    checked: boolean("checked").notNull().default(false),
  },
  (table) => [uniqueIndex("result_cubicle_item_idx").on(table.cubicleId, table.itemId)],
);
