import { eq, sql } from "drizzle-orm";
import type { getDb } from "../../db";
import { appMetadata, netBitacora, netCategorias, netEnlaces, netEquipos, netEspacios, netPuertos, netRacks } from "../../db/schema";
import semilla from "./semilla.json" with { type: "json" };
import { CATEGORIAS_BASE, ordenCanonico } from "./modelo.ts";

type Db = Awaited<ReturnType<typeof getDb>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const MARCA = "red_semilla_version";
const BORRADOS = "red_espacios_borrados";

// Los espacios que el usuario elimina se anotan acá para que la siembra no los
// reponga. Sin esta lista, regenerar semilla.json desde el canvas cambia el hash
// de versión y devuelve a la vida cada sala que se había borrado a propósito.
export async function leerEspaciosBorrados(tx: Tx): Promise<Set<string>> {
  const [fila] = await tx.select().from(appMetadata).where(eq(appMetadata.key, BORRADOS)).limit(1);
  if (!fila?.value) return new Set();
  try {
    const ids: unknown = JSON.parse(fila.value);
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export async function registrarEspacioBorrado(tx: Tx, id: string) {
  const borrados = await leerEspaciosBorrados(tx);
  borrados.add(id);
  await tx.insert(appMetadata).values({ key: BORRADOS, value: JSON.stringify([...borrados]) })
    .onConflictDoUpdate({ target: appMetadata.key, set: { value: JSON.stringify([...borrados]) } });
}

export async function sembrarRed(db: Db) {
  await db.transaction(async (tx) => {
    // Los tipos de espacio se siembran fuera del control de versión: una base ya
    // marcada como sembrada igual necesita sus tres tipos base para que los
    // selectores de la ficha tengan qué mostrar.
    await tx.insert(netCategorias).values(CATEGORIAS_BASE).onConflictDoNothing();

    const [marca] = await tx.select().from(appMetadata).where(eq(appMetadata.key, MARCA)).limit(1);
    if (marca?.value === semilla.version) return;

    const ahora = new Date().toISOString();
    const borrados = await leerEspaciosBorrados(tx);
    const espacios = semilla.espacios.filter(espacio => !borrados.has(espacio.id));

    await tx.insert(netRacks).values(semilla.racks).onConflictDoNothing();
    await tx.insert(netEquipos).values(semilla.equipos).onConflictDoNothing();
    await tx.insert(netPuertos).values(semilla.puertos).onConflictDoNothing();
    if (espacios.length) await tx.insert(netEspacios).values(espacios).onConflictDoNothing();

    const enlaces = semilla.enlaces
      .filter(enlace => !borrados.has(enlace.a) && !borrados.has(enlace.b))
      .map(enlace => {
        const [a, b] = ordenCanonico(enlace.a, enlace.b);
        return { a, b, tipo: enlace.tipo, nota: enlace.nota, createdAt: ahora };
      });
    if (enlaces.length) await tx.insert(netEnlaces).values(enlaces).onConflictDoNothing();

    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(netBitacora);
    if (!total && semilla.revisar.length) {
      await tx.insert(netBitacora).values(semilla.revisar.map(caso => ({
        fecha: ahora, tipo: "revisar", objetivo: caso.objetivo, antes: "", despues: "", nota: caso.nota,
      })));
    }

    await tx.insert(appMetadata).values({ key: MARCA, value: semilla.version })
      .onConflictDoUpdate({ target: appMetadata.key, set: { value: semilla.version } });
  });
}
