import { aristasParaDibujar, nodoDeExtremo, type Arista } from "./aristas.ts";
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
export const ALTO_DESTINO = 30;
export const SEPARACION_DESTINO = 6;
export const ANCHO_PUERTO = 34;
export const ALTO_PUERTO = 26;
export const COLUMNAS_PUERTO = 12;
export const ANCHO_ABIERTA = COLUMNAS_PUERTO * ANCHO_PUERTO + RELLENO;
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

const nodoDeEquipo = (estado: EstadoRed, equipo: EstadoRed["equipos"][number], abiertas: Set<string>): Nodo => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
  const conRejilla = equipo.puertos > 0;
  const codigo = codigoDeEquipo(equipo.id);
  const id = conRejilla ? `eq:${equipo.id}` : puertos[0]?.id ?? `eq:${equipo.id}`;
  const abierta = conRejilla && abiertas.has(id);
  const filas = abierta ? Math.ceil(puertos.length / COLUMNAS_PUERTO) : 0;
  return {
    id,
    clase: conRejilla ? "equipo" : "aparato",
    codigo,
    etiqueta: `${codigo} · ${equipo.etiqueta}`,
    zona: FILA_BORDE.includes(equipo.tipo) ? ZONA_BORDE : equipo.rack || ZONA_BORDE,
    fila: filaDeEquipo(equipo.tipo),
    x: 0, y: 0,
    w: abierta ? ANCHO_ABIERTA : anchoDeTexto(codigo),
    h: ALTO_TARJETA + filas * (ALTO_PUERTO + 4),
    abierta,
    idsPuerto: puertos.map(puerto => puerto.id),
    puertos: abierta
      ? puertos.map((puerto, indice) => ({
          id: puerto.id,
          n: puerto.n,
          estado: puerto.estado,
          x: RELLENO / 2 + (indice % COLUMNAS_PUERTO) * ANCHO_PUERTO,
          y: ALTO_TARJETA + Math.floor(indice / COLUMNAS_PUERTO) * (ALTO_PUERTO + 4),
          w: ANCHO_PUERTO - 4,
          h: ALTO_PUERTO,
        }))
      : [],
    resumen: conRejilla ? resumenDePuertos(estado, equipo.id) : null,
    sinRuta: false,
  };
};

const nombreDeZona = (estado: EstadoRed, idZona: string) =>
  idZona === ZONA_BORDE ? "Borde · salida a internet" : estado.racks.find(rack => rack.id === idZona)?.nombre ?? idZona;

// El equipo del que cuelga un destino: el primer puerto al que está enlazado.
const padreDeDestino = (estado: EstadoRed, endpointId: string) => {
  const puerto = puertosDeEndpoint(estado, endpointId)[0];
  if (!puerto) return "";
  const equipo = estado.equipos.find(candidato => candidato.id === puerto.equipo);
  return equipo ? (equipo.puertos > 0 ? `eq:${equipo.id}` : puerto.id) : "";
};

const alcanzablesDesdeIsp = (estado: EstadoRed): Set<string> => {
  const isp = estado.equipos.find(equipo => equipo.tipo === "isp");
  const arranque = estado.puertos.find(puerto => puerto.equipo === isp?.id);
  const vistos = new Set<string>();
  if (!arranque) return vistos;
  const vecinos = new Map<string, string[]>();
  const unir = (a: string, b: string) => vecinos.set(a, [...(vecinos.get(a) ?? []), b]);
  for (const enlace of estado.enlaces) {
    const a = nodoDeExtremo(estado, enlace.a);
    const b = nodoDeExtremo(estado, enlace.b);
    if (a === b) continue;
    unir(a, b);
    unir(b, a);
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

const destinosDe = (estado: EstadoRed, padres: Map<string, Nodo>): Nodo[] => {
  const hoja = (id: string, texto: string, clase: ClaseNodo): Nodo | null => {
    const padre = padres.get(padreDeDestino(estado, id));
    if (!padre) return null;
    return {
      id, clase, codigo: texto, etiqueta: texto,
      zona: padre.zona, fila: 2,
      x: 0, y: 0, w: anchoDeTexto(texto), h: ALTO_DESTINO,
      abierta: false, idsPuerto: [], puertos: [], resumen: null, sinRuta: false,
    };
  };
  const apDe = (equipo: EstadoRed["equipos"][number]) => {
    const puerto = estado.puertos.find(candidato => candidato.equipo === equipo.id);
    if (!puerto || !puertosDeEndpoint(estado, puerto.id).length) return null;
    return hoja(puerto.id, `${codigoDeEquipo(equipo.id)} · ${equipo.etiqueta}`, "aparato");
  };
  return [
    ...estado.espacios.filter(espacio => puertosDeEndpoint(estado, espacio.id).length)
      .map(espacio => hoja(espacio.id, espacio.nombre, "espacio")),
    ...estado.cubiculos.filter(cubiculo => puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length)
      .map(cubiculo => hoja(`cub:${cubiculo.id}`, `Cubículo ${cubiculo.id}`, "cubiculo")),
    ...estado.equipos.filter(equipo => equipo.tipo === "ap").map(apDe),
  ].filter((nodo): nodo is Nodo => Boolean(nodo));
};

const bandejaDe = (estado: EstadoRed): FichaBandeja[] => [
  ...estado.espacios.filter(espacio => !puertosDeEndpoint(estado, espacio.id).length)
    .map(espacio => ({ id: espacio.id, etiqueta: espacio.nombre, grupo: GRUPOS[espacio.categoria] })),
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

// La rejilla de zonas se calcula siempre con todo cerrado, para que abrir una
// tarjeta no empuje a los racks vecinos: la zona abierta se desborda sobre la
// siguiente en vez de reacomodar el lienzo entero.
const anchoDeZona = (estado: EstadoRed, idZona: string, abiertas: Set<string>) => {
  const equipos = estado.equipos
    .filter(equipo => equipo.tipo !== "ap")
    .map(equipo => nodoDeEquipo(estado, equipo, abiertas));
  const dentro = equipos.filter(nodo => nodo.zona === idZona);
  const anchoDeFila = (fila: number) => {
    const cartas = dentro.filter(nodo => nodo.fila === fila);
    return cartas.length ? cartas.reduce((suma, carta) => suma + carta.w + SEPARACION, 0) - SEPARACION : 0;
  };
  const padres = new Map(equipos.map(nodo => [nodo.id, nodo]));
  const columnas = new Map<string, number>();
  for (const destino of destinosDe(estado, padres).filter(nodo => nodo.zona === idZona)) {
    const padre = padreDeDestino(estado, destino.id);
    columnas.set(padre, Math.max(columnas.get(padre) ?? 0, destino.w));
  }
  const anchosDestino = [...columnas.values()];
  const anchoDestinos = anchosDestino.length
    ? anchosDestino.reduce((suma, ancho) => suma + ancho + SEPARACION, 0) - SEPARACION
    : 0;
  return Math.max(anchoDeFila(0), anchoDeFila(1), anchoDestinos) + RELLENO_ZONA * 2;
};

export const construirLayout = (estado: EstadoRed, abiertas: Set<string> = new Set()): Layout => {
  const orden = ordenDeZonas(estado);
  const equipos = estado.equipos
    .filter(equipo => equipo.tipo !== "ap")
    .map(equipo => nodoDeEquipo(estado, equipo, abiertas));
  const porId = new Map(equipos.map(nodo => [nodo.id, nodo]));
  const nodos = [...equipos, ...destinosDe(estado, porId)];

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
      const altoFila = Math.max(...cartas.map(carta => carta.h));
      let cursor = xZona + RELLENO_ZONA;
      for (const carta of cartas) {
        carta.x = cursor;
        carta.y = yZona + alto;
        cursor += carta.w + SEPARACION;
      }
      ancho = Math.max(ancho, cursor - SEPARACION - xZona - RELLENO_ZONA);
      alto += altoFila + SEPARACION_FILA;
    }

    // Fila 2: una columna por equipo padre, ordenadas por la x del padre.
    const columnas = new Map<string, Nodo[]>();
    for (const destino of dentro.filter(nodo => nodo.fila === 2)) {
      const padre = padreDeDestino(estado, destino.id);
      columnas.set(padre, [...(columnas.get(padre) ?? []), destino]);
    }
    const ordenadas = [...columnas.entries()].sort(([a], [b]) => (porId.get(a)?.x ?? 0) - (porId.get(b)?.x ?? 0));
    let cursor = xZona + RELLENO_ZONA;
    let altoFila = 0;
    for (const [, pila] of ordenadas) {
      const anchoColumna = Math.max(...pila.map(destino => destino.w));
      let y = yZona + alto;
      for (const destino of pila) {
        destino.x = cursor;
        destino.y = y;
        y += ALTO_DESTINO + SEPARACION_DESTINO;
      }
      altoFila = Math.max(altoFila, y - (yZona + alto));
      cursor += anchoColumna + SEPARACION;
    }
    if (ordenadas.length) {
      ancho = Math.max(ancho, cursor - SEPARACION - xZona - RELLENO_ZONA);
      alto += altoFila;
    }

    const w = ancho + RELLENO_ZONA * 2;
    zonas.push({ id: idZona, nombre: nombreDeZona(estado, idZona), x: xZona, y: yZona, w, h: alto });
    anchoLienzo = Math.max(anchoLienzo, xZona + w);
    if (esBorde) altoBorde = alto;
    else x += anchoDeZona(estado, idZona, new Set()) + SEPARACION_ZONA;
  }

  const alcanzables = alcanzablesDesdeIsp(estado);
  for (const nodo of nodos) nodo.sinRuta = !alcanzables.has(nodo.id);

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
