import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { netBitacora, netEnlaces, netEquipos, netOrden, netPuertos, netRacks } from "../../../../db/schema";
import { leerEstado } from "../route";
import { codigoRack, planEliminarRack } from "../../../../lib/red/inventario";
import { apiErrorResponse, noStoreJson, readJson } from "../../../../lib/api-response";

type Payload = { id?: string; nombre?: string; ubicacion?: string; segmento?: string; notas?: string };

const limpiar = (valor: unknown, maximo: number) =>
  typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

const camposDe = (payload: Payload) => ({
  nombre: limpiar(payload.nombre, 120),
  ubicacion: limpiar(payload.ubicacion, 160),
  segmento: limpiar(payload.segmento, 64),
  notas: limpiar(payload.notas, 500),
});

export async function POST(request: Request) {
  try {
    const campos = camposDe(await readJson<Payload>(request));
    if (!campos.nombre) return noStoreJson({ error: "Escribe un nombre para el rack." }, { status: 400 });

    const db = await getDb();
    const id = await db.transaction(async (tx) => {
      const existentes = new Set((await tx.select({ id: netRacks.id }).from(netRacks)).map(fila => fila.id));
      const nuevo = codigoRack(existentes);
      await tx.insert(netRacks).values({ ...campos, id: nuevo, x: 0, y: 0, w: 0, h: 0 });
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "recurso-creado", objetivo: nuevo,
        antes: "", despues: campos.nombre, nota: "Rack agregado",
      });
      return nuevo;
    });
    return noStoreJson({ id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible agregar el rack.");
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readJson<Payload>(request);
    const id = limpiar(payload.id, 120);
    const campos = camposDe(payload);
    if (!id) return noStoreJson({ error: "Falta el identificador del rack." }, { status: 400 });
    if (!campos.nombre) return noStoreJson({ error: "El nombre no puede quedar vacío." }, { status: 400 });

    const db = await getDb();
    const existe = await db.transaction(async (tx) => {
      const [actual] = await tx.select().from(netRacks).where(eq(netRacks.id, id)).limit(1);
      if (!actual) return false;
      await tx.update(netRacks).set(campos).where(eq(netRacks.id, id));
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "recurso-editado", objetivo: id,
        antes: actual.nombre, despues: campos.nombre, nota: "Datos del rack",
      });
      return true;
    });
    if (!existe) return noStoreJson({ error: "Ese rack ya no existe." }, { status: 404 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el rack.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = limpiar(new URL(request.url).searchParams.get("id"), 120);
    if (!id) return noStoreJson({ error: "Falta el identificador del rack." }, { status: 400 });

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const estado = await leerEstado(tx);
      const plan = planEliminarRack(estado, id);
      if (!plan.ok) return { error: plan.error, status: 404 } as const;

      const nombre = estado.racks.find(rack => rack.id === id)?.nombre ?? id;
      // El orden importa: primero los enlaces, que apuntan a los puertos; después
      // los puertos, que apuntan a los equipos; al final el rack.
      if (plan.enlaces.length) await tx.delete(netEnlaces).where(inArray(netEnlaces.id, plan.enlaces));
      if (plan.puertos.length) await tx.delete(netPuertos).where(inArray(netPuertos.id, plan.puertos));
      if (plan.equipos.length) {
        await tx.delete(netEquipos).where(inArray(netEquipos.id, plan.equipos));
        await tx.delete(netOrden).where(inArray(netOrden.id, plan.equipos));
      }
      await tx.delete(netOrden).where(eq(netOrden.id, id));
      await tx.delete(netRacks).where(eq(netRacks.id, id));
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "recurso-borrado", objetivo: id, antes: nombre, despues: "",
        nota: `Rack eliminado con ${plan.equipos.length} equipos y ${plan.enlaces.length} conexiones`,
      });
      return { ok: true, equipos: plan.equipos.length, enlaces: plan.enlaces.length } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson(outcome);
  } catch (error) {
    return apiErrorResponse(error, "No fue posible eliminar el rack.");
  }
}
