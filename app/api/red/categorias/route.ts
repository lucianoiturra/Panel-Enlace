import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { netBitacora, netCategorias, netEspacios } from "../../../../db/schema";
import { idDisponible, slugificar, validarNombreCategoria, type Categoria } from "../../../../lib/red/modelo";
import { apiErrorResponse, noStoreJson, readJson } from "../../../../lib/api-response";

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0];
type Payload = { id?: string; nombre?: string };

const limpiar = (valor: unknown, maximo: number) =>
  typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

const listar = (tx: Tx): Promise<Categoria[]> =>
  tx.select().from(netCategorias).orderBy(asc(netCategorias.orden), asc(netCategorias.nombre));

export async function POST(request: Request) {
  try {
    const payload = await readJson<Payload>(request);
    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const categorias = await listar(tx);
      const validacion = validarNombreCategoria(categorias, limpiar(payload.nombre, 60));
      if (!validacion.ok) return { error: validacion.error, status: 400 } as const;

      const id = idDisponible(slugificar(validacion.nombre, "tipo"), new Set(categorias.map(categoria => categoria.id)));
      const orden = categorias.reduce((mayor, categoria) => Math.max(mayor, categoria.orden), -1) + 1;
      await tx.insert(netCategorias).values({ id, nombre: validacion.nombre, orden, fija: false });
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "categoria-creada", objetivo: id,
        antes: "", despues: validacion.nombre, nota: "Tipo de espacio agregado",
      });
      return { id, nombre: validacion.nombre } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson(outcome, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible agregar el tipo.");
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readJson<Payload>(request);
    const id = limpiar(payload.id, 70);
    if (!id) return noStoreJson({ error: "Falta el identificador del tipo." }, { status: 400 });

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const categorias = await listar(tx);
      const actual = categorias.find(categoria => categoria.id === id);
      if (!actual) return { error: "Ese tipo ya no existe.", status: 404 } as const;

      const validacion = validarNombreCategoria(categorias, limpiar(payload.nombre, 60), id);
      if (!validacion.ok) return { error: validacion.error, status: 400 } as const;
      if (validacion.nombre === actual.nombre) return { ok: true } as const;

      await tx.update(netCategorias).set({ nombre: validacion.nombre }).where(eq(netCategorias.id, id));
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "categoria-editada", objetivo: id,
        antes: actual.nombre, despues: validacion.nombre, nota: "Tipo de espacio renombrado",
      });
      return { ok: true } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible renombrar el tipo.");
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = limpiar(url.searchParams.get("id"), 70);
    const reasignar = limpiar(url.searchParams.get("reasignar"), 70);
    if (!id) return noStoreJson({ error: "Falta el identificador del tipo." }, { status: 400 });
    if (id === reasignar) return noStoreJson({ error: "Elige un tipo distinto al que se elimina." }, { status: 400 });

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const categorias = await listar(tx);
      const actual = categorias.find(categoria => categoria.id === id);
      if (!actual) return { error: "Ese tipo ya no existe.", status: 404 } as const;
      if (actual.fija) return { error: `«${actual.nombre}» es un tipo base y no se puede eliminar.`, status: 409 } as const;

      const enUso = await tx.select({ id: netEspacios.id }).from(netEspacios).where(eq(netEspacios.categoria, id));
      if (enUso.length) {
        const destino = categorias.find(categoria => categoria.id === reasignar);
        if (!destino) {
          return { error: `«${actual.nombre}» lo usan ${enUso.length} espacios. Elige a qué tipo moverlos.`, status: 400 } as const;
        }
        await tx.update(netEspacios).set({ categoria: destino.id }).where(eq(netEspacios.categoria, id));
      }

      await tx.delete(netCategorias).where(eq(netCategorias.id, id));
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "categoria-borrada", objetivo: id,
        antes: actual.nombre, despues: "",
        nota: enUso.length ? `${enUso.length} espacios movidos a otro tipo` : "Tipo de espacio eliminado",
      });
      return { ok: true, movidos: enUso.length } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson(outcome);
  } catch (error) {
    return apiErrorResponse(error, "No fue posible eliminar el tipo.");
  }
}
