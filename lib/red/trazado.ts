import { etiquetaEndpoint, numeroCubiculo, prefijoDe, type EstadoRed, type TipoEquipo } from "./modelo.ts";

export type Salto = { id: string; etiqueta: string; tipo: "espacio" | "cubiculo" | "puerto" | "equipo" };
export type Cadena = { saltos: Salto[]; completa: boolean; motivo?: string; camino: string[]; alcanzables: Set<string> };

const TOPE_SALTOS = 2000;
const conChasis: TipoEquipo[] = ["switch", "router", "firewall", "ap", "isp"];
const equiposDeTroncal: TipoEquipo[] = ["switch", "router", "firewall", "isp"];

const construirAdyacencia = (estado: EstadoRed) => {
  const adyacencia = new Map<string, string[]>();
  const agregar = (desde: string, hasta: string) => {
    const vecinos = adyacencia.get(desde);
    if (vecinos) vecinos.push(hasta);
    else adyacencia.set(desde, [hasta]);
  };
  for (const enlace of estado.enlaces) {
    agregar(enlace.a, enlace.b);
    agregar(enlace.b, enlace.a);
  }
  const equipos = new Map(estado.equipos.map(equipo => [equipo.id, equipo]));
  for (const puerto of estado.puertos) {
    const equipo = equipos.get(puerto.equipo);
    if (!equipo || !conChasis.includes(equipo.tipo)) continue;
    agregar(puerto.id, `eq:${equipo.id}`);
    agregar(`eq:${equipo.id}`, puerto.id);
  }
  for (const vecinos of adyacencia.values()) vecinos.sort();
  return adyacencia;
};

const esDelIsp = (estado: EstadoRed, nodoId: string) => {
  if (!nodoId.startsWith("pto:")) return false;
  const puerto = estado.puertos.find(candidato => candidato.id === nodoId);
  return estado.equipos.some(equipo => equipo.id === puerto?.equipo && equipo.tipo === "isp");
};

const tipoDeSalto = (id: string): Salto["tipo"] => {
  switch (prefijoDe(id)) {
    case "esp": return "espacio";
    case "cub": return "cubiculo";
    default: return "puerto";
  }
};

const presentar = (estado: EstadoRed, camino: string[]): Salto[] => {
  const equipoDe = (id: string) => estado.puertos.find(puerto => puerto.id === id)?.equipo ?? "";
  const saltos: Salto[] = [];
  for (const id of camino) {
    if (id.startsWith("eq:")) continue;
    const anterior = saltos[saltos.length - 1];
    if (anterior && id.startsWith("pto:") && anterior.id.startsWith("pto:") && equipoDe(id) === equipoDe(anterior.id)) continue;
    const equipo = estado.equipos.find(candidato => candidato.id === equipoDe(id));
    saltos.push({ id, etiqueta: etiquetaEndpoint(estado, id), tipo: equipo && !equipo.puertos ? "equipo" : tipoDeSalto(id) });
  }
  return saltos;
};

const motivoIncompleto = (estado: EstadoRed, origenId: string, ultimo: string) => {
  if (origenId === ultimo) {
    if (prefijoDe(origenId) === "pto") return "El puerto no tiene enlaces registrados.";
    return "Sin puerto asignado todavía.";
  }
  return `El tramo documentado llega hasta ${etiquetaEndpoint(estado, ultimo)}. Falta registrar la conexión que continúa hacia el ISP.`;
};

const esPuntoDeTroncal = (estado: EstadoRed, id: string) => {
  const equipoId = id.startsWith("eq:")
    ? id.slice(3)
    : estado.puertos.find(puerto => puerto.id === id)?.equipo;
  const equipo = estado.equipos.find(candidato => candidato.id === equipoId);
  return Boolean(equipo && equiposDeTroncal.includes(equipo.tipo));
};

const equipoDePunto = (estado: EstadoRed, id: string) => {
  const equipoId = id.startsWith("eq:")
    ? id.slice(3)
    : estado.puertos.find(puerto => puerto.id === id)?.equipo;
  return estado.equipos.find(equipo => equipo.id === equipoId);
};

// Aunque falte un cable documentado, los enlaces de borde indican en qué rack
// entra internet. La distancia por uplinks permite seguir hacia ese rack en vez
// de elegir, por longitud, una rama descendente que termina en otra sala.
const distanciasDeRackAlBorde = (estado: EstadoRed) => {
  const puertos = new Map(estado.puertos.map(puerto => [puerto.id, puerto]));
  const equipos = new Map(estado.equipos.map(equipo => [equipo.id, equipo]));
  const equipoDe = (id: string) => equipos.get(puertos.get(id)?.equipo ?? "");
  const anclas = new Set<string>();
  const vecinos = new Map<string, Set<string>>();
  const unir = (a: string, b: string) => {
    if (!vecinos.has(a)) vecinos.set(a, new Set());
    vecinos.get(a)!.add(b);
  };
  for (const enlace of estado.enlaces) {
    const a = equipoDe(enlace.a);
    const b = equipoDe(enlace.b);
    if (enlace.tipo === "borde") {
      if (a && equiposDeTroncal.includes(a.tipo) && b?.rack) anclas.add(b.rack);
      if (b && equiposDeTroncal.includes(b.tipo) && a?.rack) anclas.add(a.rack);
    }
    if (enlace.tipo !== "uplink" || !a?.rack || !b?.rack || a.rack === b.rack) continue;
    unir(a.rack, b.rack);
    unir(b.rack, a.rack);
  }
  const distancias = new Map<string, number>();
  const cola = [...anclas];
  for (const rack of cola) distancias.set(rack, 0);
  while (cola.length) {
    const rack = cola.shift()!;
    for (const vecino of vecinos.get(rack) ?? []) {
      if (distancias.has(vecino)) continue;
      distancias.set(vecino, (distancias.get(rack) ?? 0) + 1);
      cola.push(vecino);
    }
  }
  return distancias;
};

// Al seleccionar un puerto buscamos primero el destino que cuelga físicamente de
// él sin atravesar el chasis de un switch. Así, SW1 p22 enfoca el AP conectado a
// p22 y no una rama cualquiera alcanzable por los demás puertos del switch.
export const origenDeCircuito = (estado: EstadoRed, seleccionado: string) => {
  if (prefijoDe(seleccionado) !== "pto") return seleccionado;
  const vecinos = new Map<string, string[]>();
  const unir = (a: string, b: string) => vecinos.set(a, [...(vecinos.get(a) ?? []), b]);
  for (const enlace of estado.enlaces) {
    unir(enlace.a, enlace.b);
    unir(enlace.b, enlace.a);
  }
  const esDestino = (id: string) => {
    if (prefijoDe(id) === "esp" || prefijoDe(id) === "cub") return true;
    const puerto = estado.puertos.find(candidato => candidato.id === id);
    return estado.equipos.some(equipo => equipo.id === puerto?.equipo && equipo.tipo === "ap");
  };
  const vistos = new Set([seleccionado]);
  const cola = [seleccionado];
  while (cola.length) {
    const actual = cola.shift()!;
    if (actual !== seleccionado && esDestino(actual)) return actual;
    for (const vecino of vecinos.get(actual) ?? []) {
      if (vistos.has(vecino)) continue;
      vistos.add(vecino);
      cola.push(vecino);
    }
  }
  return seleccionado;
};

export const trazarCadena = (estado: EstadoRed, origenId: string): Cadena => {
  const existe = prefijoDe(origenId) === "cub"
    ? estado.cubiculos.some(cubiculo => cubiculo.id === numeroCubiculo(origenId))
    : estado.puertos.some(puerto => puerto.id === origenId) || estado.espacios.some(espacio => espacio.id === origenId);
  if (!existe) return { saltos: [], completa: false, motivo: "El punto de origen no existe.", camino: [], alcanzables: new Set() };

  const adyacencia = construirAdyacencia(estado);
  const padres = new Map<string, string>([[origenId, ""]]);
  const profundidades = new Map<string, number>([[origenId, 0]]);
  const cola = [origenId];
  let destino = "";
  let expansiones = 0;

  while (cola.length && expansiones < TOPE_SALTOS) {
    const actual = cola.shift()!;
    expansiones += 1;
    if (!destino && esDelIsp(estado, actual)) destino = actual;
    for (const vecino of adyacencia.get(actual) ?? []) {
      if (padres.has(vecino)) continue;
      padres.set(vecino, actual);
      profundidades.set(vecino, (profundidades.get(actual) ?? 0) + 1);
      cola.push(vecino);
    }
  }

  const masLejano = () => {
    const distancias = distanciasDeRackAlBorde(estado);
    let elegido = origenId;
    let mejor = -1;
    let mejorDistancia = Number.POSITIVE_INFINITY;
    for (const [id, profundidad] of profundidades) {
      if (!esPuntoDeTroncal(estado, id)) continue;
      const equipo = equipoDePunto(estado, id);
      const distancia = equipo?.rack ? distancias.get(equipo.rack) ?? Number.POSITIVE_INFINITY : -1;
      if (
        distancia < mejorDistancia
        || (distancia === mejorDistancia && profundidad > mejor)
        || (distancia === mejorDistancia && profundidad === mejor && id < elegido)
      ) {
        elegido = id;
        mejor = profundidad;
        mejorDistancia = distancia;
      }
    }
    if (mejor >= 0) return elegido;
    for (const [id, profundidad] of profundidades) {
      if (id.startsWith("eq:")) continue;
      if (profundidad > mejor || (profundidad === mejor && id < elegido)) { elegido = id; mejor = profundidad; }
    }
    return elegido;
  };

  const final = destino || masLejano();
  const camino: string[] = [];
  for (let nodo = final; nodo; nodo = padres.get(nodo) ?? "") camino.unshift(nodo);
  const saltos = presentar(estado, camino);
  const alcanzables = new Set(padres.keys());
  if (destino) return { saltos, completa: true, camino, alcanzables };
  const ultimoVisible = saltos[saltos.length - 1]?.id ?? final;
  return { saltos, completa: false, motivo: motivoIncompleto(estado, origenId, ultimoVisible), camino, alcanzables };
};

export const trazarCircuito = (estado: EstadoRed, seleccionado: string) =>
  trazarCadena(estado, origenDeCircuito(estado, seleccionado));

export const saltosDesdeIsp = (cadena: Cadena) =>
  cadena.completa ? [...cadena.saltos].reverse() : cadena.saltos;

export const cadenaComoTexto = (cadena: Cadena) => {
  const ruta = saltosDesdeIsp(cadena).map(salto => salto.etiqueta).join(" → ");
  if (cadena.completa) return ruta;
  return ruta ? `${ruta} · ${cadena.motivo ?? "cadena incompleta"}` : (cadena.motivo ?? "cadena incompleta");
};
