import { normalizarMac } from "./reconciliacion.ts";

// Estado en vivo de un espacio, derivado de la presencia de su dispositivo
// testigo (AP o equipo fijo) en la red. Se alinea con el vocabulario de
// EstadoEspacio para poder volcarlo luego al estado documentado.
export type EstadoVivoUbicacion = "operativo" | "sin-internet" | "sin-testigo";

export type EspacioVivo = {
  id: string;
  nombre: string;
  categoria: string;
  estadoManual: string;
  testigoMac: string;
  estadoVivo: EstadoVivoUbicacion;
  testigoPresente: boolean;
};

export type EspacioDoc = {
  id: string;
  nombre: string;
  categoria: string;
  estado: string;
  testigoMac: string;
};

export function estadoVivo(testigoMac: string, macsPresentes: Set<string>): EstadoVivoUbicacion {
  const mac = normalizarMac(testigoMac);
  if (!mac) return "sin-testigo";
  return macsPresentes.has(mac) ? "operativo" : "sin-internet";
}

// Recibe las MAC de mon_devices que están presentes (sin normalizar) y las
// documentaciones de espacios; devuelve el estado vivo de cada uno más un
// resumen por estado.
export function estadoUbicaciones(
  espacios: EspacioDoc[],
  macsVivasPresentes: Iterable<string>,
): { ubicaciones: EspacioVivo[]; resumen: Record<EstadoVivoUbicacion, number> } {
  const presentes = new Set<string>();
  for (const mac of macsVivasPresentes) {
    const clave = normalizarMac(mac);
    if (clave) presentes.add(clave);
  }

  const resumen: Record<EstadoVivoUbicacion, number> = { operativo: 0, "sin-internet": 0, "sin-testigo": 0 };
  const ubicaciones = espacios.map((espacio) => {
    const estado = estadoVivo(espacio.testigoMac, presentes);
    resumen[estado] += 1;
    return {
      id: espacio.id,
      nombre: espacio.nombre,
      categoria: espacio.categoria,
      estadoManual: espacio.estado,
      testigoMac: espacio.testigoMac,
      estadoVivo: estado,
      testigoPresente: estado === "operativo",
    };
  });

  return { ubicaciones, resumen };
}
