import { etiquetaEndpoint, numeroCubiculo, prefijoDe, type EstadoRed, type TipoEquipo } from "./modelo.ts";

export type Salto = { id: string; etiqueta: string; tipo: "espacio" | "cubiculo" | "puerto" | "equipo" };
export type Cadena = { saltos: Salto[]; completa: boolean; motivo?: string; camino: string[]; alcanzables: Set<string> };

const TOPE_SALTOS = 2000;
const conChasis: TipoEquipo[] = ["switch", "router", "firewall", "ap", "isp"];

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
  return `La cadena termina en ${etiquetaEndpoint(estado, ultimo)} sin llegar al ISP.`;
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
    let elegido = origenId;
    let mejor = -1;
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
  return { saltos, completa: false, motivo: motivoIncompleto(estado, origenId, final), camino, alcanzables };
};

export const cadenaComoTexto = (cadena: Cadena) => {
  const ruta = cadena.saltos.map(salto => salto.etiqueta).join(" → ");
  if (cadena.completa) return ruta;
  return ruta ? `${ruta} · ${cadena.motivo ?? "cadena incompleta"}` : (cadena.motivo ?? "cadena incompleta");
};
