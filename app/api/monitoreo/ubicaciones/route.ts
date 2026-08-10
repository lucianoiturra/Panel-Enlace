import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { monDevices, netEspacios } from "../../../../db/schema";
import { apiErrorResponse, noStoreJson, readJson } from "../../../../lib/api-response";
import { estadoUbicaciones, type EspacioDoc } from "../../../../lib/red/estado-ubicacion";

const MAC_RE = /^[0-9a-fA-F]{2}([:-][0-9a-fA-F]{2}){5}$/;

export async function GET() {
  try {
    const db = await getDb();
    const espacios = await db.select().from(netEspacios).orderBy(asc(netEspacios.nombre));
    const vivos = await db.select().from(monDevices);

    const espaciosDoc: EspacioDoc[] = espacios.map((espacio) => ({
      id: espacio.id,
      nombre: espacio.nombre,
      categoria: espacio.categoria,
      estado: espacio.estado,
      testigoMac: espacio.testigoMac,
    }));
    const presentes = vivos.filter((dispositivo) => dispositivo.present).map((dispositivo) => dispositivo.mac);
    const { ubicaciones, resumen } = estadoUbicaciones(espaciosDoc, presentes);

    const candidatos = vivos
      .map((dispositivo) => ({ mac: dispositivo.mac, ip: dispositivo.ip, name: dispositivo.name, vendor: dispositivo.vendor, present: dispositivo.present }))
      .sort((a, b) => Number(b.present) - Number(a.present) || a.ip.localeCompare(b.ip, undefined, { numeric: true }));

    return noStoreJson({ ubicaciones, resumen, candidatos });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible cargar el estado por ubicación.");
  }
}

export async function PUT(request: Request) {
  try {
    const body = await readJson<{ id?: string; testigoMac?: string }>(request);
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const testigoMac = typeof body.testigoMac === "string" ? body.testigoMac.trim() : "";
    if (!id) return noStoreJson({ error: "Falta el espacio." }, { status: 400 });
    if (testigoMac && !MAC_RE.test(testigoMac)) return noStoreJson({ error: "La MAC del testigo no tiene un formato válido." }, { status: 400 });

    const db = await getDb();
    const [actualizado] = await db.update(netEspacios).set({ testigoMac }).where(eq(netEspacios.id, id)).returning({ id: netEspacios.id });
    if (!actualizado) return noStoreJson({ error: "No existe ese espacio." }, { status: 404 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el testigo.");
  }
}
