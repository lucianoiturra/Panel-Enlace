import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { netBitacora, netCategorias, netEnlaces, netEquipos, netEspacios, netOrden, netPuertos } from "../../../../db/schema";
import { leerEstado } from "../route";
import { registrarEspacioBorrado } from "../../../../lib/red/siembra";
import { CATEGORIA_POR_DEFECTO, etiquetaEndpoint, idDisponible, planEliminarEspacio, slugificar, type CategoriaEspacio } from "../../../../lib/red/modelo";
import { apiErrorResponse, noStoreJson, readJson } from "../../../../lib/api-response";

type TipoRecurso = "espacio" | "ap";
type Payload = {
  tipo?: TipoRecurso;
  id?: string;
  nombre?: string;
  ubicacion?: string;
  categoria?: CategoriaEspacio;
  modelo?: string;
};

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0];

const limpiar = (valor: unknown, maximo: number) =>
  typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

const slug = (valor: string) => slugificar(valor);

// El tipo ya no es una lista fija en el c\u00f3digo: se comprueba contra las filas de
// net_categorias y, si el que llega no existe, se cae al tipo base.
const categoriaValida = async (tx: Tx, valor: unknown): Promise<CategoriaEspacio> => {
  const id = limpiar(valor, 70);
  if (!id) return CATEGORIA_POR_DEFECTO;
  const [fila] = await tx.select({ id: netCategorias.id }).from(netCategorias).where(eq(netCategorias.id, id)).limit(1);
  return fila?.id ?? CATEGORIA_POR_DEFECTO;
};

export async function POST(request: Request) {
  try {
    const payload = await readJson<Payload>(request);
    const tipo = payload.tipo === "espacio" || payload.tipo === "ap" ? payload.tipo : "";
    const nombre = limpiar(payload.nombre, 120);
    if (!tipo) return noStoreJson({ error: "Tipo de elemento inválido." }, { status: 400 });
    if (!nombre) return noStoreJson({ error: "Escribe un nombre." }, { status: 400 });

    const db = await getDb();
    const resultado = await db.transaction(async (tx) => {
      const fecha = new Date().toISOString();
      if (tipo === "espacio") {
        const existentes = new Set((await tx.select({ id: netEspacios.id }).from(netEspacios)).map(fila => fila.id));
        const id = idDisponible(`esp:${slug(nombre)}`, existentes);
        await tx.insert(netEspacios).values({
          id,
          nombre,
          ubicacion: limpiar(payload.ubicacion, 160),
          categoria: await categoriaValida(tx, payload.categoria),
          estado: "sin-verificar",
          x: 0,
          y: 0,
          nota: "",
        });
        await tx.insert(netBitacora).values({
          fecha, tipo: "recurso-creado", objetivo: id, antes: "", despues: nombre, nota: "Espacio agregado",
        });
        return { id };
      }

      const existentes = new Set((await tx.select({ id: netEquipos.id }).from(netEquipos)).map(fila => fila.id));
      const equipoId = idDisponible(`AP-${slug(nombre)}`, existentes);
      const endpointId = `pto:${equipoId}-p0`;
      await tx.insert(netEquipos).values({
        id: equipoId,
        rack: "",
        tipo: "ap",
        etiqueta: nombre,
        modelo: limpiar(payload.modelo, 120),
        puertos: 0,
        color: "",
        x: 0,
        y: 0,
        nota: limpiar(payload.ubicacion, 160),
      });
      await tx.insert(netPuertos).values({
        id: endpointId,
        equipo: equipoId,
        n: 0,
        estado: "desconocido",
        nota: "",
      });
      await tx.insert(netBitacora).values({
        fecha, tipo: "recurso-creado", objetivo: endpointId, antes: "", despues: nombre, nota: "AP agregado",
      });
      return { id: endpointId };
    });
    return noStoreJson(resultado, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible agregar el elemento.");
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readJson<Payload>(request);
    const tipo = payload.tipo === "espacio" || payload.tipo === "ap" ? payload.tipo : "";
    const id = limpiar(payload.id, 120);
    const nombre = limpiar(payload.nombre, 120);
    if (!tipo || !id) return noStoreJson({ error: "Elemento inválido." }, { status: 400 });
    if (!nombre) return noStoreJson({ error: "El nombre no puede quedar vacío." }, { status: 400 });

    const db = await getDb();
    const resultado = await db.transaction(async (tx) => {
      const fecha = new Date().toISOString();
      if (tipo === "espacio") {
        const [actual] = await tx.select().from(netEspacios).where(eq(netEspacios.id, id)).limit(1);
        if (!actual) return false;
        await tx.update(netEspacios).set({
          nombre,
          ubicacion: limpiar(payload.ubicacion, 160),
          categoria: await categoriaValida(tx, payload.categoria),
        }).where(eq(netEspacios.id, id));
        await tx.insert(netBitacora).values({
          fecha, tipo: "recurso-editado", objetivo: id, antes: actual.nombre, despues: nombre, nota: "Datos del espacio",
        });
        return true;
      }

      const [actual] = await tx.select().from(netEquipos).where(eq(netEquipos.id, id)).limit(1);
      if (!actual || actual.tipo !== "ap") return false;
      await tx.update(netEquipos).set({
        etiqueta: nombre,
        modelo: limpiar(payload.modelo, 120),
        nota: limpiar(payload.ubicacion, 160),
      }).where(eq(netEquipos.id, id));
      await tx.insert(netBitacora).values({
        fecha, tipo: "recurso-editado", objetivo: `pto:${id}-p0`, antes: actual.etiqueta, despues: nombre, nota: "Datos del AP",
      });
      return true;
    });
    if (!resultado) return noStoreJson({ error: "El elemento ya no existe." }, { status: 404 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el elemento.");
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("tipo") !== "espacio") {
      return noStoreJson({ error: "Solo se pueden eliminar espacios por esta vía." }, { status: 400 });
    }
    const id = limpiar(url.searchParams.get("id"), 120);
    if (!id) return noStoreJson({ error: "Falta el identificador del espacio." }, { status: 400 });

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const estado = await leerEstado(tx);
      const plan = planEliminarEspacio(estado, id);
      if (!plan.ok) {
        const existe = estado.espacios.some(espacio => espacio.id === id);
        return { error: plan.error, status: existe ? 409 : 404 } as const;
      }

      const nombre = etiquetaEndpoint(estado, id);
      if (plan.enlaces.length) await tx.delete(netEnlaces).where(inArray(netEnlaces.id, plan.enlaces));
      if (plan.puertosALiberar.length) {
        await tx.update(netPuertos).set({ estado: "libre" }).where(inArray(netPuertos.id, plan.puertosALiberar));
      }
      await tx.delete(netOrden).where(eq(netOrden.id, id));
      await tx.delete(netEspacios).where(eq(netEspacios.id, id));
      await registrarEspacioBorrado(tx, id);
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(),
        tipo: "recurso-borrado",
        objetivo: id,
        antes: nombre,
        despues: "",
        nota: plan.enlaces.length ? `Espacio eliminado junto con ${plan.enlaces.length} conexiones` : "Espacio eliminado",
      });
      return { ok: true, enlaces: plan.enlaces.length } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson(outcome);
  } catch (error) {
    return apiErrorResponse(error, "No fue posible eliminar el espacio.");
  }
}
