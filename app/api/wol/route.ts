import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { cubicles, wolEventos, wolPedidos, wolProgramas } from "../../../db/schema";
import { apiErrorResponse, noStoreJson, readJson } from "../../../lib/api-response";
import { normalizarObjetivo, resumirUltimoEncendido, validarPrograma, type EventoWol } from "../../../lib/wol/programa";

// Cuántos eventos mirar para armar el parte de la mañana. Con 38 equipos, dos
// ráfagas entran de sobra y la consulta sigue siendo trivial.
const EVENTOS_RECIENTES = 120;

export async function GET() {
  try {
    const db = await getDb();
    // El pooler usa una sola conexión: lecturas en secuencia, no en paralelo.
    const programas = await db.select().from(wolProgramas).orderBy(asc(wolProgramas.hora), asc(wolProgramas.id));
    const eventos = await db
      .select({
        cubiculo: wolEventos.cubiculo,
        resultado: wolEventos.resultado,
        desperto: wolEventos.desperto,
        enviadoAt: wolEventos.enviadoAt,
      })
      .from(wolEventos)
      .orderBy(desc(wolEventos.enviadoAt))
      .limit(EVENTOS_RECIENTES);
    const [pendiente] = await db
      .select({ id: wolPedidos.id, objetivo: wolPedidos.objetivo })
      .from(wolPedidos)
      .where(isNull(wolPedidos.atendidoAt))
      .limit(1);
    const [{ conMac }] = await db
      .select({ conMac: sql<number>`count(*) filter (where mac <> '' and status <> 'no_computer')::int` })
      .from(cubicles);

    const resumen = resumirUltimoEncendido(
      eventos.map((e): EventoWol => ({ ...e, enviadoAt: e.enviadoAt.toISOString() })),
    );

    return noStoreJson({
      programas,
      resumen,
      conMac,
      // El pedido no se envía desde acá: lo recoge el timer del host. La
      // pantalla necesita saberlo para no prometer un encendido instantáneo.
      pedidoPendiente: pendiente ?? null,
      ahoraServidor: new Date().toISOString(),
    });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible cargar el encendido programado.");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);

    // Un "encender ahora" es un pedido en cola, no un envío: esta app corre en
    // un contenedor sin NET_RAW y no puede mandar un broadcast crudo.
    if (payload.accion === "encender") {
      const objetivo = normalizarObjetivo(typeof payload.objetivo === "string" ? payload.objetivo : "todos");
      if (!objetivo) return noStoreJson({ error: "Elige 'todos' o al menos un cubículo entre 1 y 40." }, { status: 400 });
      const db = await getDb();
      // Si ya hay uno esperando, no se encola otro: apretar dos veces el botón
      // no tiene por qué mandar dos ráfagas.
      const [enCola] = await db.select({ id: wolPedidos.id }).from(wolPedidos).where(isNull(wolPedidos.atendidoAt)).limit(1);
      if (enCola) return noStoreJson({ ok: true, yaEnCola: true });
      await db.insert(wolPedidos).values({ objetivo });
      return noStoreJson({ ok: true, yaEnCola: false }, { status: 201 });
    }

    const validado = validarPrograma(payload);
    if (!validado.ok) return noStoreJson({ error: validado.error }, { status: 400 });
    const db = await getDb();
    const [programa] = await db
      .insert(wolProgramas)
      .values({ ...validado.valor, creadoAt: new Date().toISOString() })
      .returning();
    return noStoreJson({ programa }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el horario.");
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id < 1) return noStoreJson({ error: "Horario inválido." }, { status: 400 });

    const db = await getDb();
    // Encender y apagar un horario es el gesto frecuente, y no tiene por qué
    // obligar a reenviar el resto de los campos.
    if (typeof payload.activo === "boolean" && payload.nombre === undefined) {
      const [cambiado] = await db.update(wolProgramas).set({ activo: payload.activo })
        .where(eq(wolProgramas.id, id)).returning({ id: wolProgramas.id });
      if (!cambiado) return noStoreJson({ error: "Ese horario ya no existe." }, { status: 404 });
      return noStoreJson({ ok: true });
    }

    const validado = validarPrograma(payload);
    if (!validado.ok) return noStoreJson({ error: validado.error }, { status: 400 });
    const [cambiado] = await db.update(wolProgramas).set(validado.valor)
      .where(eq(wolProgramas.id, id)).returning({ id: wolProgramas.id });
    if (!cambiado) return noStoreJson({ error: "Ese horario ya no existe." }, { status: 404 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el horario.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return noStoreJson({ error: "Horario inválido." }, { status: 400 });
    const db = await getDb();
    const [borrado] = await db.delete(wolProgramas).where(eq(wolProgramas.id, id)).returning({ id: wolProgramas.id });
    if (!borrado) return noStoreJson({ error: "Ese horario ya no existe." }, { status: 404 });
    // Los eventos que disparó ese horario NO se borran: son el registro de qué
    // encendió y qué no, y siguen valiendo aunque el horario ya no exista.
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible eliminar el horario.");
  }
}
