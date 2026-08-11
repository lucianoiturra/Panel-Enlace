import type { EspacioVivo } from "./estado-ubicacion.ts";
import type { Espacio, EstadoRed } from "./modelo.ts";

// De dónde salió el estado que se muestra: del testigo en la red (auto) o de lo
// que alguien escribió en la ficha (manual).
export type OrigenEstado = "auto" | "manual";

export type EspacioEfectivo = Espacio & {
  estadoManual: Espacio["estado"];
  origen: OrigenEstado;
  testigoPresente: boolean;
};

// EspacioEfectivo extiende Espacio, así que una RedEfectiva sigue sirviendo
// donde se espera un EstadoRed: los componentes que no usan el origen no
// cambian de tipo.
export type RedEfectiva = Omit<EstadoRed, "espacios"> & { espacios: EspacioEfectivo[] };

export const MINUTOS_FRESCURA = 15;

export function datosFrescos(refrescado: string | null, ahora = Date.now()): boolean {
  if (!refrescado) return false;
  const marca = new Date(refrescado).getTime();
  if (Number.isNaN(marca)) return false;
  return ahora - marca <= MINUTOS_FRESCURA * 60_000;
}

// `auto` guarda la fila viva en vez de un booleano para que TypeScript la
// estreche: con un boolean aparte, `vivo` seguiría siendo posiblemente
// undefined dentro del ternario.
export function estadoEfectivo(espacio: Espacio, vivo: EspacioVivo | undefined, frescos: boolean): EspacioEfectivo {
  const auto = frescos && vivo && vivo.estadoVivo !== "sin-testigo" ? vivo : null;
  return {
    ...espacio,
    estado: auto ? (auto.estadoVivo === "operativo" ? "operativo" : "sin-internet") : espacio.estado,
    estadoManual: espacio.estado,
    origen: auto ? "auto" : "manual",
    testigoPresente: auto ? auto.testigoPresente : false,
  };
}

export function aplicarEstadoVivo(estado: EstadoRed, vivos: EspacioVivo[], frescos: boolean): RedEfectiva {
  const porId = new Map(vivos.map(item => [item.id, item]));
  return { ...estado, espacios: estado.espacios.map(espacio => estadoEfectivo(espacio, porId.get(espacio.id), frescos)) };
}
