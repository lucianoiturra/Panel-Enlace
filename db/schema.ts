import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const cubicles = sqliteTable("cubicles", {
  id: integer("id").primaryKey(),
  brandModel: text("brand_model").notNull().default(""),
  serialNumber: text("serial_number").notNull().default(""),
  inventoryCode: text("inventory_code").notNull().default(""),
  keyboard: text("keyboard").notNull().default("Sin registrar"),
  mouse: text("mouse").notNull().default("Sin registrar"),
  ip: text("ip").notNull().default(""),
  observations: text("observations").notNull().default(""),
  status: text("status").notNull().default("pending"),
  updatedAt: text("updated_at").notNull(),
});

export const checklistItems = sqliteTable("checklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  createdAt: text("created_at").notNull(),
});

export const checklistResults = sqliteTable(
  "checklist_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cubicleId: integer("cubicle_id").notNull(),
    itemId: integer("item_id").notNull(),
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [uniqueIndex("result_cubicle_item_idx").on(table.cubicleId, table.itemId)],
);
