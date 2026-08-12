import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { cubicles, monDevices, netBitacora } from "../../../../db/schema";
import { apiErrorResponse, noStoreJson } from "../../../../lib/api-response";
import { datosFrescos } from "../../../../lib/red/estado-efectivo";
import { planAdopcion, type CambioPedido } from "../../../../lib/red/adopcion-ip";
import { reconciliar, type CubiculoDoc, type DispositivoVivo } from "../../../../lib/red/reconciliacion";

export async function POST(request: Request) {
  try {
    const cuerpo = await request.json().catch(() => ({})) as { cambios?: CambioPedido[] };
    const pedidos = Array.isArray(cuerpo.cambios) ? cuerpo.cambios.filter(cambio => Number.isInteger(cambio?.id)) : [];
    if (!pedidos.length) return noStoreJson({ error: "No se pidió adoptar ninguna IP." }, { status: 400 });

    const db = await getDb();
    // El pooler usa una sola conexión: lecturas en secuencia, no en paralelo.
    const documentados = await db
      .select({ id: cubicles.id, ip: cubicles.ip, mac: cubicles.mac, status: cubicles.status, marca: cubicles.brandModel })
      .from(cubicles)
      .orderBy(asc(cubicles.id));
    const vivos = await db.select().from(monDevices);

    const refrescado = vivos.reduce<Date | null>(
      (mayor, fila) => (mayor === null || fila.refreshedAt > mayor ? fila.refreshedAt : mayor),
      null,
    );
    // Adoptar desde un volcado viejo escribiría en la documentación una foto de
    // hace horas, que es peor que no escribir nada.
    if (!datosFrescos(refrescado ? refrescado.toISOString() : null)) {
      return noStoreJson({ error: "Los datos de red no están frescos. Espera al próximo volcado." }, { status: 409 });
    }

    const cubiculos: CubiculoDoc[] = documentados.map(fila => ({ id: fila.id, ip: fila.ip, mac: fila.mac, status: fila.status, marca: fila.marca }));
    const dispositivos: DispositivoVivo[] = vivos.map(fila => ({
      mac: fila.mac, ip: fila.ip, nombre: fila.name, fabricante: fila.vendor,
      ultimaConexion: fila.lastConnection, presente: fila.present,
    }));
    const plan = planAdopcion(reconciliar(cubiculos, dispositivos).cubiculos, pedidos, true);

    if (!plan.aplicar.length) return noStoreJson({ actualizados: [], omitidos: plan.omitidos });

    // Una transacción: un fallo a mitad de camino no puede dejar media sala
    // reescrita con IP nuevas y media con las viejas.
    const actualizados = await db.transaction(async (tx) => {
      const fecha = new Date().toISOString();
      const hechos: number[] = [];
      for (const cambio of plan.aplicar) {
        await tx.update(cubicles).set({ ip: cambio.ip, updatedAt: fecha }).where(eq(cubicles.id, cambio.id));
        // Los cubículos no tienen bitácora propia (hallazgo U8), así que se usa
        // la de red con objetivo cub:N, que es justo por donde la ficha de RED
        // ya filtra su historial.
        await tx.insert(netBitacora).values({
          fecha, tipo: "ip-adoptada", objetivo: `cub:${cambio.id}`,
          antes: cambio.antes, despues: cambio.ip,
          nota: "IP real adoptada desde el monitoreo.",
        });
        hechos.push(cambio.id);
      }
      return hechos;
    });

    return noStoreJson({ actualizados, omitidos: plan.omitidos });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible adoptar las IP.");
  }
}
