import { eq, sql } from "drizzle-orm";
import type { getDb } from "../../db";
import { appMetadata, netBitacora, netEnlaces, netEquipos, netEspacios, netPuertos, netRacks } from "../../db/schema";
import semilla from "./semilla.json" with { type: "json" };
import { ordenCanonico } from "./modelo";

type Db = Awaited<ReturnType<typeof getDb>>;
const MARCA = "red_semilla_version";

export async function sembrarRed(db: Db) {
  const [marca] = await db.select().from(appMetadata).where(eq(appMetadata.key, MARCA)).limit(1);
  if (marca?.value === semilla.version) return;

  const ahora = new Date().toISOString();
  await db.insert(netRacks).values(semilla.racks).onConflictDoNothing();
  await db.insert(netEquipos).values(semilla.equipos).onConflictDoNothing();
  await db.insert(netPuertos).values(semilla.puertos).onConflictDoNothing();
  await db.insert(netEspacios).values(semilla.espacios).onConflictDoNothing();

  const enlaces = semilla.enlaces.map(enlace => {
    const [a, b] = ordenCanonico(enlace.a, enlace.b);
    return { a, b, tipo: enlace.tipo, nota: enlace.nota, createdAt: ahora };
  });
  if (enlaces.length) await db.insert(netEnlaces).values(enlaces).onConflictDoNothing();

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(netBitacora);
  if (!total && semilla.revisar.length) {
    await db.insert(netBitacora).values(semilla.revisar.map(caso => ({
      fecha: ahora, tipo: "revisar", objetivo: caso.objetivo, antes: "", despues: "", nota: caso.nota,
    })));
  }

  await db.insert(appMetadata).values({ key: MARCA, value: semilla.version })
    .onConflictDoUpdate({ target: appMetadata.key, set: { value: semilla.version } });
}
