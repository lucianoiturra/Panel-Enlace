import { puertosDeEndpoint, type EstadoPuerto, type EstadoRed, type TipoEnlace, type TipoEquipo } from "./modelo.ts";

export const ANCHO_PUERTO = 34;
export const ALTO_EQUIPO = 62;
export const ANCHO_HOJA = 190;
export const ALTO_HOJA = 46;
export const SEPARACION = 26;
export const ALTO_CAPA = 200;
export const ZONA_BORDE = "borde";

export type ClaseNodo = "equipo" | "aparato" | "espacio" | "cubiculo";
export type PuertoNodo = { id: string; n: number; estado: EstadoPuerto; x: number; y: number; w: number; h: number };
export type Nodo = { id: string; clase: ClaseNodo; etiqueta: string; capa: number; x: number; y: number; w: number; h: number; puertos: PuertoNodo[]; isla: boolean };
export type Arista = { id: number; a: string; b: string; nodoA: string; nodoB: string; tipo: TipoEnlace };
export type FichaBandeja = { id: string; etiqueta: string; grupo: string };
export type Layout = { nodos: Nodo[]; aristas: Arista[]; bandeja: FichaBandeja[]; ancho: number; alto: number };

const CAPAS: Record<TipoEquipo, number> = { isp: 0, firewall: 1, router: 1, switch: 2, patchpanel: 3, ap: 4 };
const CAPA_HOJA = 4;
const GRUPOS = { sala: "Salas", oficina: "Oficinas", otro: "Otros" } as const;

export const capaDeEquipo = (tipo: TipoEquipo) => CAPAS[tipo];

export const ordenDeZonas = (estado: EstadoRed): string[] => {
  const equipos = new Map(estado.equipos.map(equipo => [equipo.id, equipo]));
  const puertos = new Map(estado.puertos.map(puerto => [puerto.id, puerto]));
  const rackDe = (extremo: string) => equipos.get(puertos.get(extremo)?.equipo ?? "")?.rack ?? "";

  const racks = new Set(estado.equipos.map(equipo => equipo.rack).filter(Boolean));
  const vecinos = new Map<string, Set<string>>();
  const unir = (a: string, b: string) => {
    if (!vecinos.has(a)) vecinos.set(a, new Set());
    vecinos.get(a)!.add(b);
  };

  let arranque = "";
  for (const enlace of estado.enlaces) {
    const a = rackDe(enlace.a);
    const b = rackDe(enlace.b);
    if (enlace.tipo === "borde" && !arranque) arranque = a || b;
    if (enlace.tipo !== "uplink" || !a || !b || a === b) continue;
    unir(a, b);
    unir(b, a);
  }

  const orden: string[] = [];
  const vistos = new Set<string>();
  const cola = racks.has(arranque) ? [arranque] : [];
  while (cola.length) {
    const actual = cola.shift()!;
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    orden.push(actual);
    for (const vecino of [...(vecinos.get(actual) ?? [])].sort()) if (!vistos.has(vecino)) cola.push(vecino);
  }
  for (const rack of [...racks].sort()) if (!vistos.has(rack)) orden.push(rack);
  return [ZONA_BORDE, ...orden];
};

const agregarVecino = (mapa: Map<string, string[]>, desde: string, hasta: string) => {
  const vecinos = mapa.get(desde);
  if (vecinos) vecinos.push(hasta);
  else mapa.set(desde, [hasta]);
};

const nodosDeEquipos = (estado: EstadoRed): Nodo[] => estado.equipos.map(equipo => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
  const conPuertos = equipo.puertos > 0;
  const ancho = conPuertos ? Math.max(puertos.length, 1) * ANCHO_PUERTO + 12 : ANCHO_HOJA;
  return {
    id: conPuertos ? `eq:${equipo.id}` : puertos[0]?.id ?? `eq:${equipo.id}`,
    clase: conPuertos ? "equipo" : "aparato",
    etiqueta: conPuertos ? `${equipo.id.replace("-", "/")} · ${equipo.etiqueta}` : equipo.etiqueta,
    capa: capaDeEquipo(equipo.tipo),
    x: 0,
    y: 0,
    w: ancho,
    h: conPuertos ? ALTO_EQUIPO : ALTO_HOJA,
    puertos: conPuertos ? puertos.map((puerto, indice) => ({ id: puerto.id, n: puerto.n, estado: puerto.estado, x: 6 + indice * ANCHO_PUERTO, y: 20, w: ANCHO_PUERTO - 4, h: ALTO_EQUIPO - 28 })) : [],
    isla: false,
  };
});

const nodosDeHojas = (estado: EstadoRed): Nodo[] => {
  const hoja = (id: string, etiqueta: string, clase: ClaseNodo): Nodo => ({ id, clase, etiqueta, capa: CAPA_HOJA, x: 0, y: 0, w: ANCHO_HOJA, h: ALTO_HOJA, puertos: [], isla: false });
  return [
    ...estado.espacios.filter(espacio => puertosDeEndpoint(estado, espacio.id).length).map(espacio => hoja(espacio.id, espacio.nombre, "espacio")),
    ...estado.cubiculos.filter(cubiculo => puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length).map(cubiculo => hoja(`cub:${cubiculo.id}`, `Cubículo ${cubiculo.id}`, "cubiculo")),
  ];
};

const bandejaDe = (estado: EstadoRed): FichaBandeja[] => [
  ...estado.espacios.filter(espacio => !puertosDeEndpoint(estado, espacio.id).length).map(espacio => ({ id: espacio.id, etiqueta: espacio.nombre, grupo: GRUPOS[espacio.categoria] })),
  ...estado.cubiculos.filter(cubiculo => !puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length).map(cubiculo => ({ id: `cub:${cubiculo.id}`, etiqueta: `Cubículo ${cubiculo.id}`, grupo: "Cubículos" })),
];

export const construirLayout = (estado: EstadoRed): Layout => {
  const nodos = [...nodosDeEquipos(estado), ...nodosDeHojas(estado)];

  const nodoDePunto = new Map<string, string>();
  for (const nodo of nodos) {
    nodoDePunto.set(nodo.id, nodo.id);
    for (const puerto of nodo.puertos) nodoDePunto.set(puerto.id, nodo.id);
  }

  const aristas: Arista[] = [];
  for (const enlace of estado.enlaces) {
    const nodoA = nodoDePunto.get(enlace.a);
    const nodoB = nodoDePunto.get(enlace.b);
    if (!nodoA || !nodoB) continue;
    aristas.push({ id: enlace.id, a: enlace.a, b: enlace.b, nodoA, nodoB, tipo: enlace.tipo });
  }

  const vecinos = new Map<string, string[]>();
  for (const arista of aristas) {
    if (arista.nodoA === arista.nodoB) continue;
    agregarVecino(vecinos, arista.nodoA, arista.nodoB);
    agregarVecino(vecinos, arista.nodoB, arista.nodoA);
  }

  const capas = [0, 1, 2, 3, 4];
  const porId = new Map(nodos.map(nodo => [nodo.id, nodo]));
  const centros = new Map<string, number>();
  const filas = capas.map(capa => nodos.filter(nodo => nodo.capa === capa));

  const clave = (nodo: Nodo) => {
    const arriba = (vecinos.get(nodo.id) ?? [])
      .map(id => porId.get(id))
      .filter(vecino => vecino && vecino.capa === nodo.capa - 1)
      .map(vecino => centros.get(vecino!.id) ?? Number.MAX_SAFE_INTEGER);
    return arriba.length ? Math.min(...arriba) : Number.MAX_SAFE_INTEGER;
  };

  let ancho = 0;
  for (const fila of filas) {
    fila.sort((a, b) => clave(a) - clave(b) || (a.id < b.id ? -1 : 1));
    let x = 0;
    for (const nodo of fila) {
      nodo.x = x;
      nodo.y = nodo.capa * ALTO_CAPA;
      centros.set(nodo.id, x + nodo.w / 2);
      x += nodo.w + SEPARACION;
    }
    ancho = Math.max(ancho, Math.max(x - SEPARACION, 0));
  }

  for (const fila of filas) {
    if (!fila.length) continue;
    const anchoFila = fila[fila.length - 1].x + fila[fila.length - 1].w;
    const corrimiento = (ancho - anchoFila) / 2;
    for (const nodo of fila) {
      nodo.x += corrimiento;
      centros.set(nodo.id, nodo.x + nodo.w / 2);
    }
  }

  const raiz = nodos.find(nodo => nodo.capa === 0);
  if (raiz) {
    const vistos = new Set([raiz.id]);
    const cola = [raiz.id];
    while (cola.length) {
      const actual = cola.shift()!;
      for (const vecino of vecinos.get(actual) ?? []) {
        if (vistos.has(vecino)) continue;
        vistos.add(vecino);
        cola.push(vecino);
      }
    }
    for (const nodo of nodos) nodo.isla = !vistos.has(nodo.id);
  }

  return { nodos, aristas, bandeja: bandejaDe(estado), ancho, alto: (capas.length - 1) * ALTO_CAPA + ALTO_EQUIPO };
};

export const anclasDeLayout = (layout: Layout) => {
  const anclas = new Map<string, { x: number; y: number }>();
  for (const nodo of layout.nodos) {
    anclas.set(nodo.id, { x: nodo.x + nodo.w / 2, y: nodo.y + nodo.h / 2 });
    for (const puerto of nodo.puertos) anclas.set(puerto.id, { x: nodo.x + puerto.x + puerto.w / 2, y: nodo.y + puerto.y + puerto.h / 2 });
  }
  return anclas;
};
