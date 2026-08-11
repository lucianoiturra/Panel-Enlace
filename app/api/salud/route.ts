import { desc, ne, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { monDevices, monSalud, netEspacios } from "../../../db/schema";
import { apiErrorResponse, noStoreJson } from "../../../lib/api-response";
import { evaluarSalud, type HechoSalud } from "../../../lib/salud/evaluar";

export async function GET() {
  try {
    const db = await getDb();
    // El pooler usa una sola conexión: lecturas en secuencia, no en paralelo.
    const filas = await db.select().from(monSalud);
    const frescura = await db
      .select({ refrescado: monDevices.refreshedAt })
      .from(monDevices)
      .orderBy(desc(monDevices.refreshedAt))
      .limit(1);
    const conTestigo = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(netEspacios)
      .where(ne(netEspacios.testigoMac, ""));

    const hechos: HechoSalud[] = filas.map((fila) => ({
      clave: fila.clave,
      valor: fila.valor,
      numero: fila.numero,
      medidoAt: fila.medidoAt.toISOString(),
    }));

    const salud = evaluarSalud(
      hechos,
      frescura[0]?.refrescado?.toISOString() ?? null,
      conTestigo[0]?.total ?? 0,
      Date.now(),
    );
    return noStoreJson(salud);
  } catch (error) {
    return apiErrorResponse(error, "No fue posible cargar la salud del sistema.");
  }
}
