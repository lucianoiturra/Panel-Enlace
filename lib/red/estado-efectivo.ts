import type { EspacioVivo, EstadoVivoUbicacion } from "./estado-ubicacion.ts";
import type { Espacio, EstadoRed } from "./modelo.ts";

// De dónde salió el estado que se muestra: del testigo en la red (auto) o de lo
// que alguien escribió en la ficha (manual).
export type OrigenEstado = "auto" | "manual";

export type EspacioEfectivo = Espacio & {
  estadoManual: Espacio["estado"];
  origen: OrigenEstado;
  testigoPresente: boolean;
  // Lo que dijo la red, o null si no había noticias frescas que consultar. La
  // ficha lo necesita para distinguir "el sidecar está mudo" de "este testigo
  // ya no existe": las dos terminan en manual, pero se arreglan distinto.
  estadoVivo: EstadoVivoUbicacion | null;
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

// Sólo estos dos son noticias sobre el enlace. `sin-testigo` es que nadie
// asignó sensor y `testigo-desconocido` es que el sensor se perdió: ninguno
// autoriza a pisar lo que alguien escribió a mano.
const ESTADOS_QUE_MANDAN = ["operativo", "sin-internet"] as const;

// `auto` guarda la fila viva en vez de un booleano para que TypeScript la
// estreche: con un boolean aparte, `vivo` seguiría siendo posiblemente
// undefined dentro del ternario.
export function estadoEfectivo(espacio: Espacio, vivo: EspacioVivo | undefined, frescos: boolean): EspacioEfectivo {
  const consultable = frescos && vivo ? vivo : null;
  const auto = consultable && (ESTADOS_QUE_MANDAN as readonly string[]).includes(consultable.estadoVivo) ? consultable : null;
  return {
    ...espacio,
    estado: auto ? (auto.estadoVivo === "operativo" ? "operativo" : "sin-internet") : espacio.estado,
    estadoManual: espacio.estado,
    origen: auto ? "auto" : "manual",
    testigoPresente: auto ? auto.testigoPresente : false,
    estadoVivo: consultable ? consultable.estadoVivo : null,
  };
}

export function aplicarEstadoVivo(estado: EstadoRed, vivos: EspacioVivo[], frescos: boolean): RedEfectiva {
  const porId = new Map(vivos.map(item => [item.id, item]));
  return { ...estado, espacios: estado.espacios.map(espacio => estadoEfectivo(espacio, porId.get(espacio.id), frescos)) };
}
