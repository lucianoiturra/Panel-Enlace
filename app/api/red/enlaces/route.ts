import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { netBitacora, netEnlaces, netPuertos } from "../../../../db/schema";
import { leerEstado } from "../route";
import { etiquetaEndpoint, ordenCanonico, prefijoDe, tipoEnlaceSugerido, tiposEnlace, validarEnlace } from "../../../../lib/red/modelo";
import { apiErrorResponse, noStoreJson, readJson } from "../../../../lib/api-response";

const limpiar = (valor: unknown, maximo: number) => typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

export async function POST(request: Request) {
  try {
    const payload = await readJson<{ a?: string; b?: string; tipo?: string; nota?: string }>(request);
    const a = limpiar(payload.a, 120);
    const b = limpiar(payload.b, 120);
    const nota = limpiar(payload.nota, 200);
    if (payload.tipo !== undefined && !tiposEnlace.includes(payload.tipo as never)) {
      return noStoreJson({ error: "Tipo de enlace inválido." }, { status: 400 });
    }
    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const estado = await leerEstado(tx);
      const validacion = validarEnlace(estado, a, b);
      if (!validacion.ok) return { error: validacion.error, status: 400 } as const;

      const [primero, segundo] = ordenCanonico(a, b);
      const tipo = payload.tipo ?? tipoEnlaceSugerido(estado, primero, segundo);
      const fecha = new Date().toISOString();
      const [enlace] = await tx.insert(netEnlaces).values({ a: primero, b: segundo, tipo, nota, createdAt: fecha }).returning({ id: netEnlaces.id, a: netEnlaces.a, b: netEnlaces.b, tipo: netEnlaces.tipo, nota: netEnlaces.nota });

      for (const extremo of [primero, segundo]) {
        if (prefijoDe(extremo) !== "pto") continue;
        const puerto = estado.puertos.find(candidato => candidato.id === extremo);
        if (puerto && puerto.estado !== "ocupado" && puerto.estado !== "dañado") await tx.update(netPuertos).set({ estado: "ocupado" }).where(eq(netPuertos.id, extremo));
      }

      await tx.insert(netBitacora).values({
        fecha, tipo: "enlace-creado", objetivo: primero,
        antes: "", despues: `${etiquetaEndpoint(estado, primero)} ↔ ${etiquetaEndpoint(estado, segundo)}`, nota,
      });
      return { enlace } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson({ enlace: outcome.enlace }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "23505") return noStoreJson({ error: "Ese enlace ya existe." }, { status: 409 });
    return apiErrorResponse(error, "No fue posible crear el enlace.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return noStoreJson({ error: "Enlace inválido." }, { status: 400 });
    const db = await getDb();
    const removed = await db.transaction(async (tx) => {
      const estado = await leerEstado(tx);
      const enlace = estado.enlaces.find(candidato => candidato.id === id);
      if (!enlace) return false;

      await tx.delete(netEnlaces).where(eq(netEnlaces.id, id));
      const fecha = new Date().toISOString();
      for (const extremo of [enlace.a, enlace.b]) {
        if (prefijoDe(extremo) !== "pto") continue;
        const puerto = estado.puertos.find(candidato => candidato.id === extremo);
        const quedan = estado.enlaces.some(otro => otro.id !== id && (otro.a === extremo || otro.b === extremo));
        if (puerto?.estado === "ocupado" && !quedan) await tx.update(netPuertos).set({ estado: "libre" }).where(eq(netPuertos.id, extremo));
      }
      await tx.insert(netBitacora).values({
        fecha, tipo: "enlace-borrado", objetivo: enlace.a,
        antes: `${etiquetaEndpoint(estado, enlace.a)} ↔ ${etiquetaEndpoint(estado, enlace.b)}`, despues: "", nota: enlace.nota,
      });
      return true;
    });
    if (!removed) return noStoreJson({ error: "Ese enlace ya no existe." }, { status: 404 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible borrar el enlace.");
  }
}
