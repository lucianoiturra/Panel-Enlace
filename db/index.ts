import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let initialized: Promise<void> | null = null;

async function ensureSchema() {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = env.DB;
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS cubicles (
        id INTEGER PRIMARY KEY,
        brand_model TEXT NOT NULL DEFAULT '',
        serial_number TEXT NOT NULL DEFAULT '',
        inventory_code TEXT NOT NULL DEFAULT '',
        admin_pin_status TEXT NOT NULL DEFAULT 'unreviewed',
        student_pin_status TEXT NOT NULL DEFAULT 'unreviewed',
        keyboard TEXT NOT NULL DEFAULT 'Sin registrar',
        mouse TEXT NOT NULL DEFAULT 'Sin registrar',
        ip TEXT NOT NULL DEFAULT '',
        observations TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS checklist_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cubicle_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        checked INTEGER NOT NULL DEFAULT 0
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS result_cubicle_item_idx ON checklist_results (cubicle_id, item_id)"),
    ]);

    const columns = await db.prepare("PRAGMA table_info(cubicles)").all<{ name: string }>();
    if (!columns.results.some((column) => column.name === "inventory_code")) {
      await db.prepare("ALTER TABLE cubicles ADD COLUMN inventory_code TEXT NOT NULL DEFAULT ''").run();
    }
    if (!columns.results.some((column) => column.name === "admin_pin_status")) {
      await db.prepare("ALTER TABLE cubicles ADD COLUMN admin_pin_status TEXT NOT NULL DEFAULT 'unreviewed'").run();
    }
    if (!columns.results.some((column) => column.name === "student_pin_status")) {
      await db.prepare("ALTER TABLE cubicles ADD COLUMN student_pin_status TEXT NOT NULL DEFAULT 'unreviewed'").run();
    }

    const now = new Date().toISOString();
    const seeds = Array.from({ length: 40 }, (_, index) =>
      db.prepare("INSERT OR IGNORE INTO cubicles (id, brand_model, updated_at) VALUES (?, ?, ?)").bind(index + 1, "Lenovo IdeaCentre AIO 310-20IAP (Type F0CL)", now),
    );
    await db.batch(seeds);
    await db.prepare("UPDATE cubicles SET brand_model = ? WHERE brand_model = '' AND status != 'no_computer'").bind("Lenovo IdeaCentre AIO 310-20IAP (Type F0CL)").run();

    const count = await db.prepare("SELECT COUNT(*) AS total FROM checklist_items").first<{ total: number }>();
    if (!count?.total) {
      const defaults = ["Enciende correctamente", "Acceso a internet", "Audio operativo", "Pantalla sin daños"];
      await db.batch(defaults.map((label) => db.prepare("INSERT INTO checklist_items (label, created_at) VALUES (?, ?)").bind(label, now)));
    }
  })();
  return initialized;
}

export async function getDb() {
  if (!env.DB) throw new Error("El almacenamiento no está disponible.");
  await ensureSchema();
  return drizzle(env.DB, { schema });
}
