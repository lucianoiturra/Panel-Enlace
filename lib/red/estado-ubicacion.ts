import { normalizarMac } from "./reconciliacion.ts";

// Estado en vivo de un espacio, derivado de la presencia de su dispositivo
// testigo (AP o equipo fijo) en la red. Se alinea con el vocabulario de
// EstadoEspacio para poder volcarlo luego al estado documentado.
//
// `testigo-desconocido` no es un sabor de `sin-internet`: el testigo dejó de
// figurar en NetAlertX (retirado, archivado o con MAC nueva), así que perdimos
// el sensor, no el enlace. Decir "sin internet" mandaría a alguien a buscar una
// falla inexistente, y para el estado efectivo cuenta como no saber nada.
export type EstadoVivoUbicacion = "operativo" | "sin-internet" | "sin-testigo" | "testigo-desconocido";

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

export function estadoVivo(
  testigoMac: string,
  macsPresentes: Set<string>,
  macsConocidas: Set<string>,
): EstadoVivoUbicacion {
  const mac = normalizarMac(testigoMac);
  if (!mac) return "sin-testigo";
  if (macsPresentes.has(mac)) return "operativo";
  return macsConocidas.has(mac) ? "sin-internet" : "testigo-desconocido";
}

const normalizarTodas = (macs: Iterable<string>) => {
  const claves = new Set<string>();
  for (const mac of macs) {
    const clave = normalizarMac(mac);
    if (clave) claves.add(clave);
  }
  return claves;
};

// Recibe las MAC de mon_devices que están presentes y las que figuran en la
// tabla sea cual sea su presencia (ambas sin normalizar), más las
// documentaciones de espacios; devuelve el estado vivo de cada uno y un resumen
// por estado.
export function estadoUbicaciones(
  espacios: EspacioDoc[],
  macsVivasPresentes: Iterable<string>,
  macsVivasConocidas: Iterable<string>,
): { ubicaciones: EspacioVivo[]; resumen: Record<EstadoVivoUbicacion, number> } {
  const presentes = normalizarTodas(macsVivasPresentes);
  const conocidas = normalizarTodas(macsVivasConocidas);

  const resumen: Record<EstadoVivoUbicacion, number> = { operativo: 0, "sin-internet": 0, "sin-testigo": 0, "testigo-desconocido": 0 };
  const ubicaciones = espacios.map((espacio) => {
    const estado = estadoVivo(espacio.testigoMac, presentes, conocidas);
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
