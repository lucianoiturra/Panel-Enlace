import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { cubicles, netBitacora, netEnlaces, netEquipos, netEspacios, netPuertos, netRacks } from "../../../db/schema";
import { sembrarRed } from "../../../lib/red/siembra";
import { estadosEspacio, estadosPuerto, prefijoDe, type EstadoRed } from "../../../lib/red/modelo";

type Db = Awaited<ReturnType<typeof getDb>>;

export async function leerEstado(db: Db): Promise<EstadoRed> {
  const racks = await db.select().from(netRacks).orderBy(asc(netRacks.id));
  const equipos = await db.select().from(netEquipos).orderBy(asc(netEquipos.id));
  const puertos = await db.select().from(netPuertos).orderBy(asc(netPuertos.equipo), asc(netPuertos.n));
  const espacios = await db.select().from(netEspacios).orderBy(asc(netEspacios.nombre));
  const enlaces = await db.select({ id: netEnlaces.id, a: netEnlaces.a, b: netEnlaces.b, tipo: netEnlaces.tipo, nota: netEnlaces.nota }).from(netEnlaces).orderBy(asc(netEnlaces.id));
  const bitacora = await db.select().from(netBitacora).orderBy(desc(netBitacora.id)).limit(200);
  const cubiculos = await db.select({ id: cubicles.id, status: cubicles.status, ip: cubicles.ip, mac: cubicles.mac, inventoryCode: cubicles.inventoryCode }).from(cubicles).orderBy(asc(cubicles.id));
  return { racks, equipos, puertos, espacios, enlaces, bitacora, cubiculos } as EstadoRed;
}

export async function GET() {
  try {
    const db = await getDb();
    await sembrarRed(db);
    return Response.json(await leerEstado(db));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar la red" }, { status: 500 });
  }
}

const limpiar = (valor: unknown, maximo: number) => typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as { tipo?: string; id?: string; estado?: string; nota?: string };
    const tipo = payload.tipo === "espacio" || payload.tipo === "puerto" ? payload.tipo : "";
    const id = limpiar(payload.id, 120);
    if (!tipo) return Response.json({ error: "Tipo inválido: usa espacio o puerto." }, { status: 400 });
    if (prefijoDe(id) !== (tipo === "espacio" ? "esp" : "pto")) return Response.json({ error: "El identificador no corresponde al tipo." }, { status: 400 });

    const nota = limpiar(payload.nota, 500);
    const permitidos: string[] = tipo === "espacio" ? estadosEspacio : estadosPuerto;
    const estado = typeof payload.estado === "string" ? payload.estado : "";
    if (estado && !permitidos.includes(estado)) return Response.json({ error: "Estado inválido." }, { status: 400 });

    const db = await getDb();
    const tabla = tipo === "espacio" ? netEspacios : netPuertos;
    const [actual] = await db.select().from(tabla).where(eq(tabla.id, id)).limit(1);
    if (!actual) return Response.json({ error: "No existe ese registro." }, { status: 404 });

    const fecha = new Date().toISOString();
    const entradas: { fecha: string; tipo: string; objetivo: string; antes: string; despues: string; nota: string }[] = [];
    if (estado && estado !== actual.estado) entradas.push({ fecha, tipo: tipo === "espacio" ? "estado-espacio" : "estado-puerto", objetivo: id, antes: actual.estado, despues: estado, nota: "" });
    if (payload.nota !== undefined && nota !== actual.nota) entradas.push({ fecha, tipo: "nota", objetivo: id, antes: actual.nota, despues: nota, nota: "" });
    if (!entradas.length) return Response.json({ ok: true });

    await db.update(tabla).set({
      ...(estado ? { estado } : {}),
      ...(payload.nota !== undefined ? { nota } : {}),
    }).where(eq(tabla.id, id));
    await db.insert(netBitacora).values(entradas);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible guardar" }, { status: 500 });
  }
}
