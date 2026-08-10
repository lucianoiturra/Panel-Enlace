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
    const refrescado = vivos.length ? vivos[0].refreshedAt : null;
    return noStoreJson({ ...reconciliacion, refrescado });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible cargar el monitoreo.");
  }
}
