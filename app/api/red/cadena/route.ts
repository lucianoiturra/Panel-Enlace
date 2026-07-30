import { asc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { cubicles, netEnlaces, netEquipos, netEspacios, netPuertos } from "../../../../db/schema";
import { trazarCadena } from "../../../../lib/red/trazado";
import type { EstadoRed } from "../../../../lib/red/modelo";
import { apiErrorResponse, noStoreJson } from "../../../../lib/api-response";

export async function GET(request: Request) {
  try {
    const endpoint = new URL(request.url).searchParams.get("endpoint")?.trim() ?? "";
    if (!/^(pto|esp|cub):[\w:\-.]+$/.test(endpoint)) return noStoreJson({ error: "Punto de origen inválido." }, { status: 400 });
    const db = await getDb();
    const equipos = await db.select().from(netEquipos).orderBy(asc(netEquipos.id));
    const puertos = await db.select().from(netPuertos).orderBy(asc(netPuertos.id));
    const espacios = await db.select().from(netEspacios).orderBy(asc(netEspacios.id));
    const enlaces = await db.select({ id: netEnlaces.id, a: netEnlaces.a, b: netEnlaces.b, tipo: netEnlaces.tipo, nota: netEnlaces.nota }).from(netEnlaces);
    const listaCubiculos = await db.select({ id: cubicles.id, status: cubicles.status, ip: cubicles.ip, mac: cubicles.mac, inventoryCode: cubicles.inventoryCode }).from(cubicles);
    const estado = { racks: [], equipos, puertos, espacios, enlaces, bitacora: [], cubiculos: listaCubiculos } as EstadoRed;
    return noStoreJson(trazarCadena(estado, endpoint));
  } catch (error) {
    return apiErrorResponse(error, "No fue posible trazar la cadena.");
  }
}
