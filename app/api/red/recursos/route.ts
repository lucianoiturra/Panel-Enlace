import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { netBitacora, netEquipos, netEspacios, netPuertos } from "../../../../db/schema";
import { categoriasEspacio, type CategoriaEspacio } from "../../../../lib/red/modelo";
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

const limpiar = (valor: unknown, maximo: number) =>
  typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

const slug = (valor: string) => valor
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 70) || "nuevo";

const idDisponible = (base: string, existentes: Set<string>) => {
  if (!existentes.has(base)) return base;
  for (let numero = 2; numero < 1000; numero += 1) {
    const candidato = `${base}-${numero}`;
    if (!existentes.has(candidato)) return candidato;
  }
  return `${base}-${Date.now()}`;
};

const categoriaValida = (valor: unknown): CategoriaEspacio =>
  categoriasEspacio.includes(valor as CategoriaEspacio) ? valor as CategoriaEspacio : "sala";

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
          categoria: categoriaValida(payload.categoria),
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
          categoria: categoriaValida(payload.categoria),
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
