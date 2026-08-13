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
  borde: "Borde",
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

// Un rótulo que no cabe es un dato de entrada posible, no un accidente: los
// tipos de espacio se renombran desde la interfaz.
export const recortarAlAncho = (texto: string, ancho: number): string => {
  if (anchoDeTexto(texto) <= ancho) return texto;
  let corte = texto.length;
  while (corte > 1 && anchoDeTexto(`${texto.slice(0, corte)}…`) > ancho) corte -= 1;
  return `${texto.slice(0, corte).trimEnd()}…`;
};

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

import { ordenarPor } from "./layout.ts";

export const ID_GRUPO_CUBICULOS = "grp:cubiculos";
export const ID_GRUPO_APS = "grp:aps";
export const idGrupoDe = (categoria: string) => `grp:${categoria}`;

export const ALTO_DESTINO = 26;
export const SEPARACION_DESTINO = 5;
export const ALTO_CABECERA_GRUPO = 26;
export const SEPARACION_BLOQUE = 22;
export const ALTO_TITULO_BLOQUE = 18;

type Destino = { id: string; etiqueta: string; grupo: string; grupoTitulo: string };

// Un destino solo existe en el diagrama si tiene por dónde llegar. Los que no,
// viven en la bandeja de «sin puerto asignado», igual que hoy.
const destinosConectados = (estado: EstadoRed): Destino[] => [
  ...estado.espacios
    .filter(espacio => puertosDeEndpoint(estado, espacio.id).length)
    .map(espacio => ({
      id: espacio.id, etiqueta: espacio.nombre,
      grupo: idGrupoDe(espacio.categoria), grupoTitulo: etiquetaCategoria(estado, espacio.categoria),
    })),
  ...estado.cubiculos
    .filter(cubiculo => puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length)
    .map(cubiculo => ({
      id: `cub:${cubiculo.id}`, etiqueta: `Cubículo ${cubiculo.id}`,
      grupo: ID_GRUPO_CUBICULOS, grupoTitulo: "Cubículos",
    })),
  ...estado.equipos
    .filter(equipo => equipo.tipo === "ap")
    .map(equipo => {
      const puerto = estado.puertos.find(candidato => candidato.equipo === equipo.id);
      if (!puerto || !puertosDeEndpoint(estado, puerto.id).length) return null;
      return {
        id: puerto.id, etiqueta: `${codigoDeEquipo(equipo.id)} · ${equipo.etiqueta}`,
        grupo: ID_GRUPO_APS, grupoTitulo: "Puntos de acceso Wi-Fi",
      };
    })
    .filter((destino): destino is Destino => destino !== null),
];

const nodoDeDestino = (destino: Destino): NodoFlujo => ({
  id: destino.id,
  clase: (destino.id.startsWith("cub:") ? "cubiculo" : destino.id.startsWith("esp:") ? "espacio" : "aparato") as ClaseNodo,
  codigo: destino.etiqueta, etiqueta: destino.etiqueta,
  capa: "destinos", bloque: destino.grupo, zona: "", fila: 2,
  x: 0, y: 0, w: ANCHO_GRUPO_DESTINO - RELLENO, h: ALTO_DESTINO,
  abierta: false, idsPuerto: [], puertos: [], resumen: null, estado: null, sinRuta: false,
});

const bandejaDe = (estado: EstadoRed): FichaBandeja[] => [
  ...estado.espacios.filter(espacio => !puertosDeEndpoint(estado, espacio.id).length)
    .map(espacio => ({ id: espacio.id, etiqueta: espacio.nombre, grupo: etiquetaCategoria(estado, espacio.categoria) })),
  ...estado.cubiculos.filter(cubiculo => !puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length)
    .map(cubiculo => ({ id: `cub:${cubiculo.id}`, etiqueta: `Cubículo ${cubiculo.id}`, grupo: "Cubículos" })),
  ...estado.equipos.filter(equipo => equipo.puertos === 0 && equipo.tipo === "ap")
    .filter(equipo => {
      const puerto = estado.puertos.find(candidato => candidato.equipo === equipo.id);
      return !puerto || !puertosDeEndpoint(estado, puerto.id).length;
    })
    .map(equipo => ({
      id: estado.puertos.find(candidato => candidato.equipo === equipo.id)?.id ?? `eq:${equipo.id}`,
      etiqueta: `${codigoDeEquipo(equipo.id)} · ${equipo.etiqueta}`,
      grupo: "Equipos sin enlace",
    })),
];

import { nodoDeExtremo } from "./aristas.ts";

// Baricentro: cada nodo se coloca en la media de las posiciones de sus vecinos
// de la capa anterior. Dos pasadas alcanzan sobre una topología de 25 equipos y
// el resultado es determinista, que es lo que permite probarlo.
const PASADAS_BARICENTRO = 2;

const ordenarPorBaricentro = (
  ids: string[],
  vecinos: Map<string, string[]>,
  posicionPrevia: Map<string, number>,
): string[] => {
  const base = new Map(ids.map((id, indice) => [id, indice]));
  // `undefined` y no el índice de entrada: un nodo sin vecinos no tiene una `y`
  // de la capa anterior con la que compararse, y el índice (0, 1, 2…) siempre
  // gana contra una media real de coordenadas, que valen cientos. Eso los
  // mandaba siempre primero — justo lo contrario de "sin vecinos, al final".
  const media = (id: string): number | undefined => {
    const lista = (vecinos.get(id) ?? []).map(vecino => posicionPrevia.get(vecino)).filter((valor): valor is number => valor !== undefined);
    return lista.length ? lista.reduce((suma, valor) => suma + valor, 0) / lista.length : undefined;
  };
  // El desempate por el índice original es lo que hace determinista al orden:
  // sin él, dos nodos con la misma media (o dos sin vecinos) quedarían a
  // merced del sort. Los sin vecinos se agrupan al final, también en ese orden.
  return [...ids].sort((a, b) => {
    const mediaA = media(a);
    const mediaB = media(b);
    if (mediaA === undefined && mediaB === undefined) return base.get(a)! - base.get(b)!;
    if (mediaA === undefined) return 1;
    if (mediaB === undefined) return -1;
    return mediaA - mediaB || base.get(a)! - base.get(b)!;
  });
};

export const cruces = (flujo: Flujo): number => {
  const y = new Map(flujo.nodos.map(nodo => [nodo.id, nodo.y]));
  const x = new Map(flujo.nodos.map(nodo => [nodo.id, nodo.x]));
  const aristas = flujo.cintas.filter(cinta => !cinta.intraCapa && y.has(cinta.a) && y.has(cinta.b));
  let total = 0;
  for (let i = 0; i < aristas.length; i += 1) {
    for (let j = i + 1; j < aristas.length; j += 1) {
      const una = aristas[i];
      const otra = aristas[j];
      if (x.get(una.a) !== x.get(otra.a) || x.get(una.b) !== x.get(otra.b)) continue;
      const cruzan = (y.get(una.a)! - y.get(otra.a)!) * (y.get(una.b)! - y.get(otra.b)!) < 0;
      if (cruzan) total += 1;
    }
  }
  return total;
};

import { aristasParaDibujar } from "./aristas.ts";

// El peso lo fija el tipo y la cantidad solo modula dentro de su banda. Al revés
// —que es como estaba— nueve rosetas de una sala se dibujan más gruesas que el
// uplink que las alimenta, y la jerarquía queda invertida.
//
// El máximo de cada banda tiene que quedar por debajo de la base de la banda
// siguiente: si no, una cinta de roseta con muchos enlaces alcanza o supera a
// un patch con uno solo, y la inversión que esto viene a arreglar reaparece
// arriba de la escala en vez de abajo. Por eso el máximo de roseta queda en
// 1.9 y no en 2.4: a 2.4 empata con la base de patch (2) en vez de quedar por
// debajo.
const BANDA: Record<TipoEnlace, { base: number; max: number; opacidad: number }> = {
  borde: { base: 5, max: 7, opacidad: 1 },
  uplink: { base: 4.5, max: 6.5, opacidad: 0.95 },
  patch: { base: 2, max: 4, opacidad: 0.55 },
  roseta: { base: 1.2, max: 1.9, opacidad: 0.3 },
};

export const grosorDeCinta = (tipo: TipoEnlace, cuenta: number): number => {
  const banda = BANDA[tipo] ?? BANDA.patch;
  return Math.min(banda.max, banda.base + Math.log2(Math.max(cuenta, 1)) * 0.5);
};

export const opacidadDeCinta = (tipo: TipoEnlace): number => (BANDA[tipo] ?? BANDA.patch).opacidad;

const alcanzablesDesdeIsp = (estado: EstadoRed): Set<string> => {
  const isp = estado.equipos.find(equipo => equipo.tipo === "isp");
  const arranque = estado.puertos.find(puerto => puerto.equipo === isp?.id);
  const vistos = new Set<string>();
  if (!arranque) return vistos;
  const vecinos = new Map<string, string[]>();
  for (const enlace of estado.enlaces) {
    const a = nodoDeExtremo(estado, enlace.a);
    const b = nodoDeExtremo(estado, enlace.b);
    if (a === b) continue;
    vecinos.set(a, [...(vecinos.get(a) ?? []), b]);
    vecinos.set(b, [...(vecinos.get(b) ?? []), a]);
  }
  const cola = [nodoDeExtremo(estado, arranque.id)];
  while (cola.length) {
    const actual = cola.shift()!;
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    for (const vecino of vecinos.get(actual) ?? []) if (!vistos.has(vecino)) cola.push(vecino);
  }
  return vistos;
};

export const anclasDeFlujo = (flujo: Flujo): Map<string, { x: number; y: number }> => {
  const anclas = new Map<string, { x: number; y: number }>();
  for (const nodo of flujo.nodos) {
    const centro = { x: nodo.x + nodo.w / 2, y: nodo.y + nodo.h / 2 };
    anclas.set(nodo.id, centro);
    for (const id of nodo.idsPuerto) anclas.set(id, centro);
    for (const puerto of nodo.puertos) {
      anclas.set(puerto.id, { x: nodo.x + puerto.x + puerto.w / 2, y: nodo.y + puerto.y + puerto.h / 2 });
    }
  }
  // Un grupo de destinos colapsado no dibuja a sus miembros, pero sus cintas
  // siguen apuntándoles: caen a la cabecera del grupo, que es lo que hace que
  // la cinta agregada salga de un punto y no del vacío.
  for (const bloque of flujo.bloques) {
    if (!bloque.colapsable || bloque.abierto) continue;
    anclas.set(bloque.id, { x: bloque.x + bloque.w / 2, y: bloque.y + ALTO_CABECERA_GRUPO / 2 });
  }
  return anclas;
};

export type OpcionesFlujo = { baricentro?: boolean };

export const construirFlujo = (
  estado: EstadoRed,
  abiertas: Set<string> = new Set(),
  opciones: OpcionesFlujo = {},
): Flujo => {
  const nodos = estado.equipos
    .filter(equipo => equipo.tipo !== "ap")
    .map(equipo => nodoDeEquipo(estado, equipo, abiertas));

  const columnas: ColumnaFlujo[] = [];
  let x = 0;
  for (const capa of CAPAS) {
    const w = capa === "destinos" ? ANCHO_GRUPO_DESTINO : anchoDeColumna(capa, estado);
    if (!w) continue;
    columnas.push({ capa, titulo: recortarAlAncho(TITULO_CAPA[capa], w), x, w });
    x += w + SEPARACION_COLUMNA;
  }
  const destinos = destinosConectados(estado);
  const porGrupo = new Map<string, Destino[]>();
  const tituloGrupo = new Map<string, string>();
  for (const destino of destinos) {
    porGrupo.set(destino.grupo, [...(porGrupo.get(destino.grupo) ?? []), destino]);
    tituloGrupo.set(destino.grupo, destino.grupoTitulo);
  }
  for (const [grupo, lista] of porGrupo) {
    if (!abiertas.has(grupo)) continue;
    for (const destino of lista) nodos.push(nodoDeDestino(destino));
  }

  const vecinosPorNodo = new Map<string, string[]>();
  for (const enlace of estado.enlaces) {
    const a = nodoDeExtremo(estado, enlace.a);
    const b = nodoDeExtremo(estado, enlace.b);
    if (a === b) continue;
    vecinosPorNodo.set(a, [...(vecinosPorNodo.get(a) ?? []), b]);
    vecinosPorNodo.set(b, [...(vecinosPorNodo.get(b) ?? []), a]);
  }
  const posicionPrevia = new Map<string, number>();

  let bloques: BloqueFlujo[] = [];
  let grupos: string[][] = [];
  let alto = 0;

  // Dos pasadas: en la primera `posicionPrevia` está vacía y el baricentro cae
  // al orden alfabético; en la segunda ya tiene las `y` reales de la capa
  // anterior y es cuando de verdad reduce cruces.
  for (let pasada = 0; pasada < PASADAS_BARICENTRO; pasada += 1) {
    bloques = [];
    grupos = [];
    alto = 0;
    for (const columna of columnas) {
      let y = ALTO_TITULO_COLUMNA;

      if (columna.capa === "destinos") {
        // Los grupos se ordenan igual que los equipos: por la media de las y de
        // quienes los alimentan. Sin esto el Map itera en orden de inserción y la
        // columna con más cruces es justo la que queda sin ordenar.
        const padresDeGrupo = new Map<string, string[]>();
        for (const [grupo, lista] of porGrupo) {
          const padres = lista.flatMap(destino =>
            puertosDeEndpoint(estado, destino.id).map(puerto => {
              const equipo = estado.equipos.find(candidato => candidato.id === puerto.equipo);
              return equipo && equipo.puertos > 0 ? `eq:${equipo.id}` : puerto.id;
            }));
          padresDeGrupo.set(grupo, padres);
        }
        const ordenGrupos = ordenarPor(
          estado.orden,
          ordenarPorBaricentro([...porGrupo.keys()], padresDeGrupo, posicionPrevia),
        );

        for (const grupo of ordenGrupos) {
          const lista = porGrupo.get(grupo)!;
          const abierto = abiertas.has(grupo);
          const inicio = y;
          y += ALTO_CABECERA_GRUPO;
          if (abierto) {
            const ids = ordenarPor(estado.orden, lista.map(destino => destino.id));
            grupos.push(ids);
            const porId = new Map(nodos.map(nodo => [nodo.id, nodo]));
            for (const id of ids) {
              const nodo = porId.get(id);
              if (!nodo) continue;
              nodo.x = columna.x + RELLENO / 2;
              nodo.y = y;
              y += ALTO_DESTINO + SEPARACION_DESTINO;
            }
          }
          bloques.push({
            id: grupo, capa: "destinos", titulo: tituloGrupo.get(grupo) ?? grupo,
            x: columna.x, y: inicio, w: columna.w, h: y - inicio,
            colapsable: true, abierto, cuenta: lista.length,
          });
          y += SEPARACION_BLOQUE;
        }
        alto = Math.max(alto, y);
      } else {
        // Fuera de los destinos, el bloque es el rack: los tres racks son 100 %
        // intra-rack salvo los tres uplinks, así que agrupar por rack no es
        // cosmético, es la estructura real del cableado.
        const dentro = nodos.filter(nodo => nodo.capa === columna.capa);
        const porBloque = new Map<string, NodoFlujo[]>();
        for (const nodo of dentro) porBloque.set(nodo.bloque, [...(porBloque.get(nodo.bloque) ?? []), nodo]);

        for (const [bloqueId, lista] of porBloque) {
          const inicio = y;
          const conTitulo = columna.capa !== "borde";
          if (conTitulo) y += ALTO_TITULO_BLOQUE;
          // Los vacíos al final: un 0/24 no es lo que alguien viene a mirar, y arriba
          // empuja hacia abajo a los que sí tienen cableado.
          //
          // `resumen === null` (el ISP, el router: equipos sin rejilla de puertos) no
          // es lo mismo que "0 ocupados" y no cuenta como vacío. No tienen puertos que
          // contar, y son justo los nodos que nunca deberían caer al fondo de su
          // columna — son la columna entera.
          const vacio = (id: string) => {
            const resumen = lista.find(nodo => nodo.id === id)?.resumen;
            return resumen && resumen.ocupados === 0 ? 1 : 0;
          };
          const alfabetico = lista.map(nodo => nodo.id).sort()
            .sort((a, b) => vacio(a) - vacio(b));
          const automatico = opciones.baricentro === false
            ? alfabetico
            : ordenarPorBaricentro(alfabetico, vecinosPorNodo, posicionPrevia);
          const ids = ordenarPor(estado.orden, automatico);
          grupos.push(ids);
          const porId = new Map(lista.map(nodo => [nodo.id, nodo]));
          for (const id of ids) {
            const nodo = porId.get(id)!;
            nodo.x = columna.x;
            nodo.y = y;
            y += nodo.h + SEPARACION_NODO;
          }
          bloques.push({
            id: bloqueId, capa: columna.capa,
            titulo: conTitulo ? (estado.racks.find(rack => rack.id === bloqueId)?.nombre ?? bloqueId) : "",
            x: columna.x, y: inicio, w: columna.w, h: y - inicio,
            colapsable: false, abierto: true, cuenta: lista.length,
          });
          y += SEPARACION_BLOQUE;
        }
        alto = Math.max(alto, y);
      }

      // Al cerrar cada columna, alimentar posicionPrevia para la siguiente.
      for (const nodo of nodos.filter(item => item.capa === columna.capa)) posicionPrevia.set(nodo.id, nodo.y);
    }
  }

  const alcanzables = alcanzablesDesdeIsp(estado);
  for (const nodo of nodos) nodo.sinRuta = !alcanzables.has(nodo.id);

  // Un destino dentro de un grupo cerrado no se dibuja, así que su cinta se
  // redirige a la cabecera del grupo y las de un mismo grupo se agregan en una.
  const grupoDe = new Map(destinos.map(destino => [destino.id, destino.grupo]));
  const visible = (id: string) => nodos.some(nodo => nodo.id === id) ? id : grupoDe.get(id) ?? id;
  const capaDe = new Map<string, Capa>(nodos.map(nodo => [nodo.id, nodo.capa]));
  for (const bloque of bloques) if (bloque.colapsable) capaDe.set(bloque.id, "destinos");

  const agregadas = new Map<string, CintaFlujo>();
  for (const arista of aristasParaDibujar(estado, abiertas)) {
    const a = visible(nodoDeExtremo(estado, arista.a) === arista.a ? arista.a : nodoDeExtremo(estado, arista.a));
    const b = visible(nodoDeExtremo(estado, arista.b) === arista.b ? arista.b : nodoDeExtremo(estado, arista.b));
    if (a === b) continue;
    const capaA = CAPAS.indexOf(capaDe.get(a) ?? "destinos");
    const capaB = CAPAS.indexOf(capaDe.get(b) ?? "destinos");
    // Se orienta siempre de la capa menor a la mayor: es lo que garantiza que
    // ninguna cinta se dibuje hacia atrás.
    const [desde, hasta] = capaA <= capaB ? [a, b] : [b, a];
    const clave = `${desde}|${hasta}`;
    const previa = agregadas.get(clave);
    if (previa) {
      previa.cuenta += arista.cuenta;
      previa.enlaceId = 0;
      continue;
    }
    agregadas.set(clave, {
      clave, a: desde, b: hasta, tipo: arista.tipo, cuenta: arista.cuenta,
      enlaceId: arista.enlaceId, intraCapa: capaA === capaB,
    });
  }
  const cintas = [...agregadas.values()];

  return {
    columnas, bloques, nodos, cintas, bandeja: bandejaDe(estado), grupos,
    ancho: columnas.length ? columnas[columnas.length - 1].x + columnas[columnas.length - 1].w : 0,
    alto,
  };
};
