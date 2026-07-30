import { aristasParaDibujar, type Arista } from "./aristas.ts";
import { puertosDeEndpoint, type EstadoPuerto, type EstadoRed, type TipoEquipo } from "./modelo.ts";

export const TIPOGRAFIA = 15;
// Ancho medio de un carácter como fracción del tamaño de fuente. Antes servía para
// recortar la etiqueta al nodo; ahora dimensiona el nodo según su etiqueta.
export const ANCHO_CARACTER = 0.55;
export const ANCHO_MINIMO = 120;
export const RELLENO = 16;
export const ALTO_TARJETA = 44;
export const SEPARACION = 26;
export const SEPARACION_FILA = 54;
export const SEPARACION_ZONA = 60;
export const RELLENO_ZONA = 16;
export const ALTO_TITULO_ZONA = 24;
export const ZONA_BORDE = "borde";

export type ResumenPuertos = { total: number; ocupados: number; libres: number; dañados: number; sinVerificar: number };
export type ClaseNodo = "equipo" | "aparato" | "espacio" | "cubiculo";
export type PuertoNodo = { id: string; n: number; estado: EstadoPuerto; x: number; y: number; w: number; h: number };
export type Nodo = {
  id: string; clase: ClaseNodo; codigo: string; etiqueta: string;
  zona: string; fila: number;
  x: number; y: number; w: number; h: number;
  abierta: boolean; idsPuerto: string[]; puertos: PuertoNodo[];
  resumen: ResumenPuertos | null; sinRuta: boolean;
};
export type Zona = { id: string; nombre: string; x: number; y: number; w: number; h: number };
export type FichaBandeja = { id: string; etiqueta: string; grupo: string };
export type Layout = { zonas: Zona[]; nodos: Nodo[]; aristas: Arista[]; bandeja: FichaBandeja[]; ancho: number; alto: number };

const FILA_BORDE: TipoEquipo[] = ["isp", "firewall", "router"];
const GRUPOS = { sala: "Salas", oficina: "Oficinas", otro: "Otros" } as const;

export const anchoDeTexto = (texto: string) =>
  Math.max(ANCHO_MINIMO, Math.round(texto.length * TIPOGRAFIA * ANCHO_CARACTER) + RELLENO);

export const codigoDeEquipo = (equipoId: string) => equipoId.replace("-", "/");

export const resumenDePuertos = (estado: EstadoRed, equipoId: string): ResumenPuertos => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipoId);
  const cuantos = (valor: EstadoPuerto) => puertos.filter(puerto => puerto.estado === valor).length;
  return {
    total: puertos.length,
    ocupados: cuantos("ocupado"),
    libres: cuantos("libre"),
    dañados: cuantos("dañado"),
    sinVerificar: cuantos("desconocido"),
  };
};

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

const filaDeEquipo = (tipo: TipoEquipo) => (FILA_BORDE.includes(tipo) ? 0 : tipo === "switch" ? 0 : 1);

const nodoDeEquipo = (estado: EstadoRed, equipo: EstadoRed["equipos"][number]): Nodo => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
  const conRejilla = equipo.puertos > 0;
  const codigo = codigoDeEquipo(equipo.id);
  return {
    id: conRejilla ? `eq:${equipo.id}` : puertos[0]?.id ?? `eq:${equipo.id}`,
    clase: conRejilla ? "equipo" : "aparato",
    codigo,
    etiqueta: `${codigo} · ${equipo.etiqueta}`,
    zona: FILA_BORDE.includes(equipo.tipo) ? ZONA_BORDE : equipo.rack || ZONA_BORDE,
    fila: filaDeEquipo(equipo.tipo),
    x: 0, y: 0, w: anchoDeTexto(codigo), h: ALTO_TARJETA,
    abierta: false,
    idsPuerto: puertos.map(puerto => puerto.id),
    puertos: [],
    resumen: conRejilla ? resumenDePuertos(estado, equipo.id) : null,
    sinRuta: false,
  };
};

const nombreDeZona = (estado: EstadoRed, idZona: string) =>
  idZona === ZONA_BORDE ? "Borde · salida a internet" : estado.racks.find(rack => rack.id === idZona)?.nombre ?? idZona;

const bandejaDe = (estado: EstadoRed): FichaBandeja[] => [
  ...estado.espacios.filter(espacio => !puertosDeEndpoint(estado, espacio.id).length)
    .map(espacio => ({ id: espacio.id, etiqueta: espacio.nombre, grupo: GRUPOS[espacio.categoria] })),
  ...estado.cubiculos.filter(cubiculo => !puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length)
    .map(cubiculo => ({ id: `cub:${cubiculo.id}`, etiqueta: `Cubículo ${cubiculo.id}`, grupo: "Cubículos" })),
];

export const construirLayout = (estado: EstadoRed, abiertas: Set<string> = new Set()): Layout => {
  const orden = ordenDeZonas(estado);
  const nodos = estado.equipos
    .filter(equipo => equipo.tipo !== "ap")
    .map(equipo => nodoDeEquipo(estado, equipo));

  const zonas: Zona[] = [];
  let x = 0;
  let altoBorde = 0;
  let anchoLienzo = 0;
  for (const idZona of orden) {
    const dentro = nodos.filter(nodo => nodo.zona === idZona);
    if (!dentro.length) continue;
    const esBorde = idZona === ZONA_BORDE;
    const xZona = esBorde ? 0 : x;
    const yZona = esBorde ? 0 : altoBorde + SEPARACION_ZONA;
    let ancho = 0;
    let alto = ALTO_TITULO_ZONA;
    for (const fila of [0, 1]) {
      const cartas = dentro.filter(nodo => nodo.fila === fila).sort((a, b) => (a.id < b.id ? -1 : 1));
      if (!cartas.length) continue;
      let cursor = xZona + RELLENO_ZONA;
      for (const carta of cartas) {
        carta.x = cursor;
        carta.y = yZona + alto;
        cursor += carta.w + SEPARACION;
      }
      ancho = Math.max(ancho, cursor - SEPARACION - xZona - RELLENO_ZONA);
      alto += ALTO_TARJETA + SEPARACION_FILA;
    }
    const w = ancho + RELLENO_ZONA * 2;
    zonas.push({ id: idZona, nombre: nombreDeZona(estado, idZona), x: xZona, y: yZona, w, h: alto });
    anchoLienzo = Math.max(anchoLienzo, xZona + w);
    if (esBorde) altoBorde = alto;
    else x += w + SEPARACION_ZONA;
  }

  return {
    zonas,
    nodos,
    aristas: aristasParaDibujar(estado, abiertas),
    bandeja: bandejaDe(estado),
    ancho: anchoLienzo,
    alto: Math.max(...zonas.map(zona => zona.y + zona.h), 0),
  };
};

export const anclasDeLayout = (layout: Layout) => {
  const anclas = new Map<string, { x: number; y: number }>();
  for (const nodo of layout.nodos) {
    const centro = { x: nodo.x + nodo.w / 2, y: nodo.y + nodo.h / 2 };
    anclas.set(nodo.id, centro);
    // Una tarjeta cerrada no dibuja sus puertos, pero trazarCadena() sí devuelve
    // ids de puerto: sin esta caída al centro la ruta no ilumina nada.
    for (const id of nodo.idsPuerto) anclas.set(id, centro);
    for (const puerto of nodo.puertos) {
      anclas.set(puerto.id, { x: nodo.x + puerto.x + puerto.w / 2, y: nodo.y + puerto.y + puerto.h / 2 });
    }
  }
  return anclas;
};
