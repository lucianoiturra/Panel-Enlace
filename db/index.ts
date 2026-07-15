import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

let initialized: Promise<void> | null = null;
let client: Client | null = null;

function getClient() {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL ?? (process.env.VERCEL ? "" : "file:local.db");
  if (!url) throw new Error("Falta configurar TURSO_DATABASE_URL en Vercel.");

  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return client;
}

async function ensureSchema() {
  if (initialized) return initialized;
  initialized = (async () => {
    const client = getClient();
    await client.batch([
      `CREATE TABLE IF NOT EXISTS cubicles (
        id INTEGER PRIMARY KEY,
        brand_model TEXT NOT NULL DEFAULT '',
        serial_number TEXT NOT NULL DEFAULT '',
        inventory_code TEXT NOT NULL DEFAULT '',
        admin_pin_status TEXT NOT NULL DEFAULT 'unreviewed',
        student_pin_status TEXT NOT NULL DEFAULT 'unreviewed',
        admin_pin_encrypted TEXT NOT NULL DEFAULT '',
        student_pin_encrypted TEXT NOT NULL DEFAULT '',
        internet_type TEXT NOT NULL DEFAULT 'unreviewed',
        outlet_status TEXT NOT NULL DEFAULT 'unreviewed',
        keyboard TEXT NOT NULL DEFAULT 'Sin registrar',
        mouse TEXT NOT NULL DEFAULT 'Sin registrar',
        ip TEXT NOT NULL DEFAULT '',
        mac TEXT NOT NULL DEFAULT '',
        observations TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS checklist_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cubicle_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        checked INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS station_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cubicle_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS result_cubicle_item_idx ON checklist_results (cubicle_id, item_id)",
      "CREATE INDEX IF NOT EXISTS task_cubicle_idx ON station_tasks (cubicle_id)",
    ]);

    const columns = await client.execute("PRAGMA table_info(cubicles)");
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    const additions = [
      ["inventory_code", "ALTER TABLE cubicles ADD COLUMN inventory_code TEXT NOT NULL DEFAULT ''"],
      ["admin_pin_status", "ALTER TABLE cubicles ADD COLUMN admin_pin_status TEXT NOT NULL DEFAULT 'unreviewed'"],
      ["student_pin_status", "ALTER TABLE cubicles ADD COLUMN student_pin_status TEXT NOT NULL DEFAULT 'unreviewed'"],
      ["admin_pin_encrypted", "ALTER TABLE cubicles ADD COLUMN admin_pin_encrypted TEXT NOT NULL DEFAULT ''"],
      ["student_pin_encrypted", "ALTER TABLE cubicles ADD COLUMN student_pin_encrypted TEXT NOT NULL DEFAULT ''"],
      ["internet_type", "ALTER TABLE cubicles ADD COLUMN internet_type TEXT NOT NULL DEFAULT 'unreviewed'"],
      ["outlet_status", "ALTER TABLE cubicles ADD COLUMN outlet_status TEXT NOT NULL DEFAULT 'unreviewed'"],
      ["mac", "ALTER TABLE cubicles ADD COLUMN mac TEXT NOT NULL DEFAULT ''"],
    ] as const;
    for (const [name, statement] of additions) {
      if (!columnNames.has(name)) await client.execute(statement);
    }

    const now = new Date().toISOString();
    const defaultModel = "Lenovo IdeaCentre AIO 310-20IAP (Type F0CL)";
    await client.batch(Array.from({ length: 40 }, (_, index) => ({
      sql: "INSERT OR IGNORE INTO cubicles (id, brand_model, updated_at) VALUES (?, ?, ?)",
      args: [index + 1, defaultModel, now],
    })));
    await client.execute({
      sql: "UPDATE cubicles SET brand_model = ? WHERE brand_model = '' AND status != 'no_computer'",
      args: [defaultModel],
    });

    const count = await client.execute("SELECT COUNT(*) AS total FROM checklist_items");
    if (!Number(count.rows[0]?.total ?? 0)) {
      const defaults = ["Enciende correctamente", "Acceso a internet", "Audio operativo", "Pantalla sin daños"];
      await client.batch(defaults.map((label) => ({
        sql: "INSERT INTO checklist_items (label, created_at) VALUES (?, ?)",
        args: [label, now],
      })));
    }
  })();
  return initialized;
}

export async function getDb() {
  await ensureSchema();
  return drizzle(getClient(), { schema });
}
