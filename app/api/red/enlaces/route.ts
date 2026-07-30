import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { netBitacora, netEnlaces, netPuertos } from "../../../../db/schema";
import { leerEstado } from "../route";
import { etiquetaEndpoint, ordenCanonico, prefijoDe, tipoEnlaceSugerido, tiposEnlace, validarEnlace } from "../../../../lib/red/modelo";

const limpiar = (valor: unknown, maximo: number) => typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { a?: string; b?: string; tipo?: string; nota?: string };
    const a = limpiar(payload.a, 120);
    const b = limpiar(payload.b, 120);
    const nota = limpiar(payload.nota, 200);
    const db = await getDb();
    const estado = await leerEstado(db);

    const validacion = validarEnlace(estado, a, b);
    if (!validacion.ok) return Response.json({ error: validacion.error }, { status: 400 });

    const [primero, segundo] = ordenCanonico(a, b);
    const tipo = payload.tipo && tiposEnlace.includes(payload.tipo as never) ? payload.tipo : tipoEnlaceSugerido(estado, primero, segundo);
    const fecha = new Date().toISOString();
    const [enlace] = await db.insert(netEnlaces).values({ a: primero, b: segundo, tipo, nota, createdAt: fecha }).returning({ id: netEnlaces.id, a: netEnlaces.a, b: netEnlaces.b, tipo: netEnlaces.tipo, nota: netEnlaces.nota });

    for (const extremo of [primero, segundo]) {
      if (prefijoDe(extremo) !== "pto") continue;
      const puerto = estado.puertos.find(candidato => candidato.id === extremo);
      if (puerto && puerto.estado !== "ocupado" && puerto.estado !== "dañado") await db.update(netPuertos).set({ estado: "ocupado" }).where(eq(netPuertos.id, extremo));
    }

    await db.insert(netBitacora).values({
      fecha, tipo: "enlace-creado", objetivo: primero,
      antes: "", despues: `${etiquetaEndpoint(estado, primero)} ↔ ${etiquetaEndpoint(estado, segundo)}`, nota,
    });
    return Response.json({ enlace }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible crear el enlace" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Enlace inválido" }, { status: 400 });
    const db = await getDb();
    const estado = await leerEstado(db);
    const enlace = estado.enlaces.find(candidato => candidato.id === id);
    if (!enlace) return Response.json({ error: "Ese enlace ya no existe." }, { status: 404 });

    await db.delete(netEnlaces).where(eq(netEnlaces.id, id));
    const fecha = new Date().toISOString();

    for (const extremo of [enlace.a, enlace.b]) {
      if (prefijoDe(extremo) !== "pto") continue;
      const puerto = estado.puertos.find(candidato => candidato.id === extremo);
      const quedan = estado.enlaces.some(otro => otro.id !== id && (otro.a === extremo || otro.b === extremo));
      if (puerto?.estado === "ocupado" && !quedan) await db.update(netPuertos).set({ estado: "libre" }).where(eq(netPuertos.id, extremo));
    }

    await db.insert(netBitacora).values({
      fecha, tipo: "enlace-borrado", objetivo: enlace.a,
      antes: `${etiquetaEndpoint(estado, enlace.a)} ↔ ${etiquetaEndpoint(estado, enlace.b)}`, despues: "", nota: enlace.nota,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible borrar el enlace" }, { status: 500 });
  }
}
