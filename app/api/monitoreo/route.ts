import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { cubicles, monDevices } from "../../../db/schema";
import { apiErrorResponse, noStoreJson } from "../../../lib/api-response";
import { reconciliar, type CubiculoDoc, type DispositivoVivo } from "../../../lib/red/reconciliacion";

export async function GET() {
  try {
    const db = await getDb();
    // El pooler usa una sola conexión: lecturas en secuencia, no en paralelo.
    const documentados = await db
      .select({ id: cubicles.id, ip: cubicles.ip, mac: cubicles.mac, status: cubicles.status, marca: cubicles.brandModel })
      .from(cubicles)
      .orderBy(asc(cubicles.id));
    const vivos = await db.select().from(monDevices);

    const cubiculos: CubiculoDoc[] = documentados.map((fila) => ({
      id: fila.id,
      ip: fila.ip,
      mac: fila.mac,
      status: fila.status,
      marca: fila.marca,
    }));
    const dispositivos: DispositivoVivo[] = vivos.map((fila) => ({
      mac: fila.mac,
      ip: fila.ip,
      nombre: fila.name,
      fabricante: fila.vendor,
      ultimaConexion: fila.lastConnection,
      presente: fila.present,
    }));

    const reconciliacion = reconciliar(cubiculos, dispositivos);
    // El sidecar reescribe la tabla entera en cada ciclo, pero un SELECT sin
    // ORDER BY no garantiza qué fila viene primero, y de esta marca depende el
    // guardia que impide que RED declare caída media escuela. Se toma el máximo.
    const refrescado = vivos.reduce<Date | null>(
      (mayor, fila) => (mayor === null || fila.refreshedAt > mayor ? fila.refreshedAt : mayor),
      null,
    );
    return noStoreJson({ ...reconciliacion, refrescado, ahoraServidor: new Date().toISOString() });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible cargar el monitoreo.");
  }
}
