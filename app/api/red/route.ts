import { asc, desc, eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { cubicles, netBitacora, netEnlaces, netEquipos, netEspacios, netOrden, netPuertos, netRacks } from "../../../db/schema";
import { sembrarRed } from "../../../lib/red/siembra";
import { estadosEspacio, estadosPuerto, prefijoDe, type EstadoRed } from "../../../lib/red/modelo";
import { apiErrorResponse, noStoreJson, readJson } from "../../../lib/api-response";

type Db = Awaited<ReturnType<typeof getDb>>;
type ReadDb = { select: Db["select"] };

export async function leerEstado(db: ReadDb): Promise<EstadoRed> {
  const racks = await db.select().from(netRacks).orderBy(asc(netRacks.id));
  const equipos = await db.select().from(netEquipos).orderBy(asc(netEquipos.id));
  const puertos = await db.select().from(netPuertos).orderBy(asc(netPuertos.equipo), asc(netPuertos.n));
  const espacios = await db.select().from(netEspacios).orderBy(asc(netEspacios.nombre));
  const enlaces = await db.select({ id: netEnlaces.id, a: netEnlaces.a, b: netEnlaces.b, tipo: netEnlaces.tipo, nota: netEnlaces.nota }).from(netEnlaces).orderBy(asc(netEnlaces.id));
  const bitacora = await db.select().from(netBitacora).orderBy(desc(netBitacora.id)).limit(200);
  const cubiculos = await db.select({ id: cubicles.id, status: cubicles.status, ip: cubicles.ip, mac: cubicles.mac, inventoryCode: cubicles.inventoryCode }).from(cubicles).orderBy(asc(cubicles.id));
  const filasOrden = await db.select().from(netOrden);
  const orden = Object.fromEntries(filasOrden.map(fila => [fila.id, fila.orden]));
  return { racks, equipos, puertos, espacios, enlaces, bitacora, cubiculos, orden } as EstadoRed;
}

export async function GET() {
  try {
    const db = await getDb();
    await sembrarRed(db);
    return noStoreJson(await leerEstado(db));
  } catch (error) {
    return apiErrorResponse(error, "No fue posible cargar la red.");
  }
}

const limpiar = (valor: unknown, maximo: number) => typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

export async function PUT(request: Request) {
  try {
    const payload = await readJson<{ tipo?: string; id?: string; estado?: string; nota?: string }>(request);
    const tipo = payload.tipo === "espacio" || payload.tipo === "puerto" ? payload.tipo : "";
    const id = limpiar(payload.id, 120);
    if (!tipo) return noStoreJson({ error: "Tipo inválido: usa espacio o puerto." }, { status: 400 });
    if (prefijoDe(id) !== (tipo === "espacio" ? "esp" : "pto")) return noStoreJson({ error: "El identificador no corresponde al tipo." }, { status: 400 });

    const nota = limpiar(payload.nota, 500);
    const permitidos: string[] = tipo === "espacio" ? estadosEspacio : estadosPuerto;
    const estado = typeof payload.estado === "string" ? payload.estado : "";
    if (estado && !permitidos.includes(estado)) return noStoreJson({ error: "Estado inválido." }, { status: 400 });

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const tabla = tipo === "espacio" ? netEspacios : netPuertos;
      const [actual] = await tx.select().from(tabla).where(eq(tabla.id, id)).limit(1);
      if (!actual) return { error: "No existe ese registro.", status: 404 } as const;

      if (tipo === "puerto" && estado === "libre") {
        const [enlace] = await tx.select({ id: netEnlaces.id }).from(netEnlaces)
          .where(or(eq(netEnlaces.a, id), eq(netEnlaces.b, id))).limit(1);
        if (enlace) return { error: "No se puede marcar libre un puerto que conserva enlaces.", status: 409 } as const;
      }

      const fecha = new Date().toISOString();
      const entradas: { fecha: string; tipo: string; objetivo: string; antes: string; despues: string; nota: string }[] = [];
      if (estado && estado !== actual.estado) entradas.push({ fecha, tipo: tipo === "espacio" ? "estado-espacio" : "estado-puerto", objetivo: id, antes: actual.estado, despues: estado, nota: "" });
      if (payload.nota !== undefined && nota !== actual.nota) entradas.push({ fecha, tipo: "nota", objetivo: id, antes: actual.nota, despues: nota, nota: "" });
      if (!entradas.length) return { ok: true } as const;

      await tx.update(tabla).set({
        ...(estado ? { estado } : {}),
        ...(payload.nota !== undefined ? { nota } : {}),
      }).where(eq(tabla.id, id));
      await tx.insert(netBitacora).values(entradas);
      return { ok: true } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el cambio.");
  }
}
