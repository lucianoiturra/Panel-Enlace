import { boolean, doublePrecision, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
  // MAC del dispositivo testigo (AP o equipo fijo) que decide el estado en
  // vivo del espacio según su presencia en mon_devices.
  testigoMac: text("testigo_mac").notNull().default(""),
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

// Foto de la salud del stack, reescrita entera cada 5 min por el timer
// salud-cabserver del host. Hechos crudos: el juicio vive en lib/salud.
export const monSalud = pgTable("mon_salud", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull().default(""),
  numero: doublePrecision("numero"),
  medidoAt: timestamp("medido_at", { withTimezone: true }).notNull().defaultNow(),
});

// mon_salud sólo tiene el presente. Acá quedan los cambios: una fila por
// cambio, no una por medición.
export const monSaludHistoria = pgTable(
  "mon_salud_historia",
  {
    id: serial("id").primaryKey(),
    clave: text("clave").notNull(),
    valor: text("valor").notNull().default(""),
    desde: timestamp("desde", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("mon_salud_historia_idx").on(table.clave, table.desde)],
);

// --- Encendido programado (Wake-on-LAN) -------------------------------------
// El paquete mágico lo manda el timer wol-cabserver del host; esta app sólo
// lee y escribe estas tres tablas. Un contenedor sin NET_RAW no puede mandar
// un broadcast crudo, y montarle privilegios para esto sería peor.

export const wolProgramas = pgTable("wol_programas", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull().default(""),
  // Días ISO como dígitos pegados: '12345' = lunes a viernes.
  dias: text("dias").notNull().default(""),
  hora: text("hora").notNull().default(""),
  // 'todos' o una lista de cubículos: '3,7,12'.
  objetivo: text("objetivo").notNull().default("todos"),
  activo: boolean("activo").notNull().default(true),
  creadoAt: text("creado_at").notNull().default(""),
});

export const wolEventos = pgTable(
  "wol_eventos",
  {
    id: serial("id").primaryKey(),
    // NULL = envío manual, no lo disparó ningún programa.
    programa: integer("programa"),
    cubiculo: integer("cubiculo").notNull(),
    mac: text("mac").notNull().default(""),
    resultado: text("resultado").notNull().default("enviado"),
    enviadoAt: timestamp("enviado_at", { withTimezone: true }).notNull().defaultNow(),
    verificadoAt: timestamp("verificado_at", { withTimezone: true }),
    desperto: boolean("desperto"),
  },
  (table) => [index("wol_evento_cubiculo_idx").on(table.cubiculo, table.enviadoAt)],
);

export const wolPedidos = pgTable("wol_pedidos", {
  id: serial("id").primaryKey(),
  objetivo: text("objetivo").notNull().default("todos"),
  pedidoAt: timestamp("pedido_at", { withTimezone: true }).notNull().defaultNow(),
  atendidoAt: timestamp("atendido_at", { withTimezone: true }),
});
