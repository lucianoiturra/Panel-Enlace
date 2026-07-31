import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { netBitacora, netEnlaces, netEquipos, netOrden, netPuertos, netRacks } from "../../../../db/schema";
import { leerEstado } from "../route";
import { MAXIMO_PUERTOS, codigoEquipo, etiquetasTipoEquipo, idPuerto, planCambioPuertos, planEliminarEquipo } from "../../../../lib/red/inventario";
import { tiposEquipo, type TipoEquipo } from "../../../../lib/red/modelo";
import { apiErrorResponse, noStoreJson, readJson } from "../../../../lib/api-response";

type Payload = {
  id?: string; rack?: string; tipo?: string; etiqueta?: string;
  marca?: string; modelo?: string; ipGestion?: string; puertos?: number; nota?: string;
};

const limpiar = (valor: unknown, maximo: number) =>
  typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

const datosDe = (payload: Payload) => ({
  etiqueta: limpiar(payload.etiqueta, 120),
  marca: limpiar(payload.marca, 80),
  modelo: limpiar(payload.modelo, 120),
  ipGestion: limpiar(payload.ipGestion, 64),
  nota: limpiar(payload.nota, 500),
});

const tipoDe = (valor: unknown): TipoEquipo | "" =>
  tiposEquipo.includes(valor as TipoEquipo) ? valor as TipoEquipo : "";

export async function POST(request: Request) {
  try {
    const payload = await readJson<Payload>(request);
    const datos = datosDe(payload);
    const tipo = tipoDe(payload.tipo);
    const rack = limpiar(payload.rack, 120);
    const puertos = Number(payload.puertos ?? 0);
    if (!tipo) return noStoreJson({ error: "Tipo de equipo inválido." }, { status: 400 });
    if (!datos.etiqueta) return noStoreJson({ error: "Escribe un nombre para el equipo." }, { status: 400 });
    if (!Number.isInteger(puertos) || puertos < 0 || puertos > MAXIMO_PUERTOS) {
      return noStoreJson({ error: `La cantidad de puertos debe ser un número entre 0 y ${MAXIMO_PUERTOS}.` }, { status: 400 });
    }

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      if (rack) {
        const [existe] = await tx.select({ id: netRacks.id }).from(netRacks).where(eq(netRacks.id, rack)).limit(1);
        if (!existe) return { error: "Ese rack no existe." , status: 400 } as const;
      }
      const existentes = new Set((await tx.select({ id: netEquipos.id }).from(netEquipos)).map(fila => fila.id));
      const id = codigoEquipo(rack, tipo, datos.etiqueta, existentes);

      // Un equipo nuevo va al final del rack: la vista ordena por y cuando no hay
      // orden manual, y con y = 0 cada equipo agregado se colaría en primer lugar.
      const hermanos = await tx.select({ y: netEquipos.y }).from(netEquipos).where(eq(netEquipos.rack, rack));
      const y = hermanos.reduce((mayor, fila) => Math.max(mayor, fila.y), 0) + 1;

      await tx.insert(netEquipos).values({ ...datos, id, rack, tipo, puertos, color: "", x: 0, y });

      const numeros = puertos === 0 ? [0] : Array.from({ length: puertos }, (_, indice) => indice + 1);
      await tx.insert(netPuertos).values(numeros.map(n => ({
        id: idPuerto(id, n), equipo: id, n, estado: "libre", nota: "",
      })));

      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "recurso-creado", objetivo: idPuerto(id, numeros[0]),
        antes: "", despues: datos.etiqueta, nota: `${etiquetasTipoEquipo[tipo]} agregado`,
      });
      return { ok: true, id, endpointId: idPuerto(id, numeros[0]) } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson(outcome, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible agregar el equipo.");
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readJson<Payload>(request);
    const id = limpiar(payload.id, 120);
    const datos = datosDe(payload);
    const tipo = tipoDe(payload.tipo);
    if (!id) return noStoreJson({ error: "Falta el identificador del equipo." }, { status: 400 });
    if (!tipo) return noStoreJson({ error: "Tipo de equipo inválido." }, { status: 400 });
    if (!datos.etiqueta) return noStoreJson({ error: "El nombre no puede quedar vacío." }, { status: 400 });

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const estado = await leerEstado(tx);
      const actual = estado.equipos.find(equipo => equipo.id === id);
      if (!actual) return { error: "Ese equipo ya no existe.", status: 404 } as const;

      const puertos = payload.puertos === undefined ? actual.puertos : Number(payload.puertos);
      const plan = planCambioPuertos(estado, id, puertos);
      if (!plan.ok) return { error: plan.error, status: 409 } as const;

      if (plan.borrar.length) await tx.delete(netPuertos).where(inArray(netPuertos.id, plan.borrar));
      if (plan.crear.length) {
        await tx.insert(netPuertos).values(plan.crear.map(n => ({
          id: idPuerto(id, n), equipo: id, n, estado: "libre", nota: "",
        })));
      }

      // El rack no se toca a propósito: su código está dentro del id de cada
      // puerto y de cada enlace, y reescribirlo dejaría la bitácora huérfana.
      await tx.update(netEquipos).set({ ...datos, tipo, puertos }).where(eq(netEquipos.id, id));

      const fecha = new Date().toISOString();
      const objetivo = idPuerto(id, puertos === 0 ? 0 : 1);
      const entradas = [{
        fecha, tipo: "recurso-editado", objetivo,
        antes: actual.etiqueta, despues: datos.etiqueta, nota: "Datos del equipo",
      }];
      if (puertos !== actual.puertos) {
        entradas.push({
          fecha, tipo: "recurso-editado", objetivo,
          antes: String(actual.puertos), despues: String(puertos), nota: "Cantidad de puertos",
        });
      }
      await tx.insert(netBitacora).values(entradas);
      return { ok: true } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el equipo.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = limpiar(new URL(request.url).searchParams.get("id"), 120);
    if (!id) return noStoreJson({ error: "Falta el identificador del equipo." }, { status: 400 });

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const estado = await leerEstado(tx);
      const plan = planEliminarEquipo(estado, id);
      if (!plan.ok) return { error: plan.error, status: 404 } as const;

      const nombre = estado.equipos.find(equipo => equipo.id === id)?.etiqueta ?? id;
      if (plan.enlaces.length) await tx.delete(netEnlaces).where(inArray(netEnlaces.id, plan.enlaces));
      if (plan.puertos.length) await tx.delete(netPuertos).where(inArray(netPuertos.id, plan.puertos));
      await tx.delete(netOrden).where(eq(netOrden.id, id));
      await tx.delete(netEquipos).where(eq(netEquipos.id, id));
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "recurso-borrado", objetivo: id, antes: nombre, despues: "",
        nota: `Equipo eliminado con ${plan.puertos.length} puertos y ${plan.enlaces.length} conexiones`,
      });
      return { ok: true, puertos: plan.puertos.length, enlaces: plan.enlaces.length } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson(outcome);
  } catch (error) {
    return apiErrorResponse(error, "No fue posible eliminar el equipo.");
  }
}
