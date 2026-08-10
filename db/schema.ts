import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
    cubicleId: integer("cubicle_id").notNull().references(() => cubicles.id, { onDelete: "cascade" }),
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
    cubicleId: integer("cubicle_id").notNull().references(() => cubicles.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull().references(() => checklistItems.id, { onDelete: "cascade" }),
    checked: boolean("checked").notNull().default(false),
  },
  (table) => [uniqueIndex("result_cubicle_item_idx").on(table.cubicleId, table.itemId)],
);

export const netRacks = pgTable("net_racks", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().default(""),
  ubicacion: text("ubicacion").notNull().default(""),
  segmento: text("segmento").notNull().default(""),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  w: integer("w").notNull().default(0),
  h: integer("h").notNull().default(0),
  notas: text("notas").notNull().default(""),
});

export const netEquipos = pgTable("net_equipos", {
  id: text("id").primaryKey(),
  rack: text("rack").notNull().default(""),
  tipo: text("tipo").notNull().default("switch"),
  etiqueta: text("etiqueta").notNull().default(""),
  marca: text("marca").notNull().default(""),
  modelo: text("modelo").notNull().default(""),
  ipGestion: text("ip_gestion").notNull().default(""),
  puertos: integer("puertos").notNull().default(0),
  color: text("color").notNull().default(""),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  nota: text("nota").notNull().default(""),
});

export const netPuertos = pgTable(
  "net_puertos",
  {
    id: text("id").primaryKey(),
    equipo: text("equipo").notNull(),
    n: integer("n").notNull(),
    estado: text("estado").notNull().default("libre"),
    nota: text("nota").notNull().default(""),
  },
  (table) => [index("net_puerto_equipo_idx").on(table.equipo)],
);

export const netEspacios = pgTable("net_espacios", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().default(""),
  ubicacion: text("ubicacion").notNull().default(""),
  categoria: text("categoria").notNull().default("sala"),
  estado: text("estado").notNull().default("sin-verificar"),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  nota: text("nota").notNull().default(""),
});

export const netCategorias = pgTable("net_categorias", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().default(""),
  orden: integer("orden").notNull().default(0),
  fija: boolean("fija").notNull().default(false),
});

export const netEnlaces = pgTable(
  "net_enlaces",
  {
    id: serial("id").primaryKey(),
    a: text("a").notNull(),
    b: text("b").notNull(),
    tipo: text("tipo").notNull().default("patch"),
    nota: text("nota").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("net_enlace_par_idx").on(table.a, table.b), index("net_enlace_a_idx").on(table.a), index("net_enlace_b_idx").on(table.b)],
);

export const netBitacora = pgTable(
  "net_bitacora",
  {
    id: serial("id").primaryKey(),
    fecha: text("fecha").notNull(),
    tipo: text("tipo").notNull(),
    objetivo: text("objetivo").notNull().default(""),
    antes: text("antes").notNull().default(""),
    despues: text("despues").notNull().default(""),
    nota: text("nota").notNull().default(""),
  },
  (table) => [index("net_bitacora_objetivo_idx").on(table.objetivo)],
);

export const netOrden = pgTable("net_orden", {
  id: text("id").primaryKey(),
  orden: integer("orden").notNull(),
});

// Instantánea de la red viva (NetAlertX), refrescada por el sidecar
// panel-mon-export. Es un caché de solo lectura: se reemplaza cada ciclo.
export const monDevices = pgTable("mon_devices", {
  mac: text("mac").primaryKey(),
  ip: text("ip").notNull().default(""),
  name: text("name").notNull().default(""),
  vendor: text("vendor").notNull().default(""),
  lastConnection: text("last_connection").notNull().default(""),
  present: boolean("present").notNull().default(false),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
});
