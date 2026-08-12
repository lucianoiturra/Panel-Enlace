import type { TipoEquipo } from "./modelo.ts";

/**
 * Las capas del diagrama son semánticas y fijas, no la distancia al ISP.
 *
 * Calcularlas por saltos —lo que haría un Sankey de manual— desplegaría la
 * cadena de uplinks en columnas: R1/SW1 a profundidad 2, R2/SW1 a 3, R3/SW1 a 4,
 * R3/SW2 a 5. Cuatro columnas de switches hoy y una más por cada switch que se
 * sume a la cadena, que es exactamente el defecto que este diseño viene a
 * arreglar. Con capas fijas, un switch nuevo crece hacia abajo.
 */
export type Capa = "borde" | "switches" | "patch" | "destinos";

export const CAPAS: Capa[] = ["borde", "switches", "patch", "destinos"];

export const TITULO_CAPA: Record<Capa, string> = {
  borde: "Borde · salida a internet",
  switches: "Switches",
  patch: "Patch panels",
  destinos: "Destinos",
};

const BORDE: TipoEquipo[] = ["isp", "firewall", "router"];

export const capaDeEquipo = (tipo: TipoEquipo): Capa => {
  if (BORDE.includes(tipo)) return "borde";
  if (tipo === "switch") return "switches";
  if (tipo === "patchpanel") return "patch";
  return "destinos";
};
