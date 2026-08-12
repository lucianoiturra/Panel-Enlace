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

import { anchoDeTexto, codigoDeEquipo, resumenDePuertos, ALTO_TARJETA, RELLENO,
  type ClaseNodo, type FichaBandeja, type Nodo, type PuertoNodo } from "./layout.ts";
import { etiquetaCategoria, puertosDeEndpoint, type Equipo, type EstadoRed, type TipoEnlace } from "./modelo.ts";

// Un puerto de 24 y no de 34: la columna reserva de entrada el ancho de su
// tarjeta abierta, y a 34 la reserva mediría 424 y el lienzo no cabría en el
// shell. A 24 una celda todavía admite dos dígitos a 11px de mono con holgura.
export const ANCHO_PUERTO_FLUJO = 24;
export const ALTO_PUERTO_FLUJO = 22;
export const COLUMNAS_PUERTO_FLUJO = 12;
export const ANCHO_ABIERTA = COLUMNAS_PUERTO_FLUJO * ANCHO_PUERTO_FLUJO + RELLENO;
export const ANCHO_GRUPO_DESTINO = 260;
export const SEPARACION_COLUMNA = 60;
export const SEPARACION_NODO = 26;
export const ALTO_TITULO_COLUMNA = 26;

export type NodoFlujo = Nodo & { capa: Capa; bloque: string };
export type BloqueFlujo = { id: string; capa: Capa; titulo: string; x: number; y: number; w: number; h: number; colapsable: boolean; abierto: boolean; cuenta: number };
export type CintaFlujo = { clave: string; a: string; b: string; tipo: TipoEnlace; cuenta: number; enlaceId: number; intraCapa: boolean };
export type Flujo = {
  columnas: ColumnaFlujo[]; bloques: BloqueFlujo[]; nodos: NodoFlujo[];
  cintas: CintaFlujo[]; bandeja: FichaBandeja[]; grupos: string[][];
  ancho: number; alto: number;
};
export type ColumnaFlujo = { capa: Capa; titulo: string; x: number; w: number };

const nodoDeEquipo = (estado: EstadoRed, equipo: Equipo, abiertas: Set<string>): NodoFlujo => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
  const conRejilla = equipo.puertos > 0;
  const codigo = codigoDeEquipo(equipo.id);
  const id = conRejilla ? `eq:${equipo.id}` : puertos[0]?.id ?? `eq:${equipo.id}`;
  const abierta = conRejilla && abiertas.has(id);
  const filas = abierta ? Math.ceil(puertos.length / COLUMNAS_PUERTO_FLUJO) : 0;
  return {
    id,
    clase: (conRejilla ? "equipo" : "aparato") as ClaseNodo,
    codigo,
    etiqueta: `${codigo} · ${equipo.etiqueta}`,
    capa: capaDeEquipo(equipo.tipo),
    bloque: equipo.rack || "sin-rack",
    zona: equipo.rack || "",
    fila: 0,
    x: 0, y: 0,
    w: abierta ? ANCHO_ABIERTA : anchoDeTexto(codigo),
    h: ALTO_TARJETA + filas * (ALTO_PUERTO_FLUJO + 4),
    abierta,
    idsPuerto: puertos.map(puerto => puerto.id),
    puertos: abierta ? puertos.map((puerto, indice): PuertoNodo => ({
      id: puerto.id,
      n: puerto.n,
      estado: puerto.estado,
      x: RELLENO / 2 + (indice % COLUMNAS_PUERTO_FLUJO) * ANCHO_PUERTO_FLUJO,
      y: ALTO_TARJETA + Math.floor(indice / COLUMNAS_PUERTO_FLUJO) * (ALTO_PUERTO_FLUJO + 4),
      w: ANCHO_PUERTO_FLUJO - 4,
      h: ALTO_PUERTO_FLUJO,
    })) : [],
    resumen: conRejilla ? resumenDePuertos(estado, equipo.id) : null,
    estado: conRejilla ? null : puertos[0]?.estado ?? null,
    sinRuta: false,
  };
};

// El ancho de la columna no depende de qué esté abierto ahora sino de qué
// puede abrirse: por eso `abiertas` no entra en este cálculo. Es lo que hace
// que abrir una tarjeta empuje hacia abajo y nunca hacia el lado.
const anchoDeColumna = (capa: Capa, estado: EstadoRed): number => {
  if (capa === "destinos") return ANCHO_GRUPO_DESTINO;
  const equipos = estado.equipos.filter(equipo => capaDeEquipo(equipo.tipo) === capa);
  if (!equipos.length) return 0;
  return Math.max(...equipos.map(equipo =>
    equipo.puertos > 0 ? ANCHO_ABIERTA : anchoDeTexto(codigoDeEquipo(equipo.id))));
};

export const construirFlujo = (estado: EstadoRed, abiertas: Set<string> = new Set()): Flujo => {
  const nodos = estado.equipos
    .filter(equipo => equipo.tipo !== "ap")
    .map(equipo => nodoDeEquipo(estado, equipo, abiertas));

  const columnas: ColumnaFlujo[] = [];
  let x = 0;
  for (const capa of CAPAS) {
    const w = capa === "destinos" ? ANCHO_GRUPO_DESTINO : anchoDeColumna(capa, estado);
    if (!w) continue;
    columnas.push({ capa, titulo: TITULO_CAPA[capa], x, w });
    x += w + SEPARACION_COLUMNA;
  }
  const xDeCapa = new Map(columnas.map(columna => [columna.capa, columna.x]));

  let alto = 0;
  for (const columna of columnas) {
    const dentro = nodos.filter(nodo => nodo.capa === columna.capa);
    let y = ALTO_TITULO_COLUMNA;
    for (const nodo of dentro) {
      nodo.x = xDeCapa.get(nodo.capa) ?? 0;
      nodo.y = y;
      y += nodo.h + SEPARACION_NODO;
    }
    alto = Math.max(alto, y);
  }

  return {
    columnas, bloques: [], nodos, cintas: [], bandeja: [], grupos: [],
    ancho: columnas.length ? columnas[columnas.length - 1].x + columnas[columnas.length - 1].w : 0,
    alto,
  };
};
