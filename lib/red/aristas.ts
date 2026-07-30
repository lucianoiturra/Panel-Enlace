import { prefijoDe, type EstadoRed, type TipoEnlace } from "./modelo.ts";

export type Arista = { clave: string; a: string; b: string; tipo: TipoEnlace; cuenta: number };

// Cuando un par junta enlaces de distinto tipo, se dibuja con el más importante.
const PESO: Record<TipoEnlace, number> = { borde: 3, uplink: 2, patch: 1, roseta: 0 };

// La convención de ids de nodo la fija layout.ts: un equipo con puertos se dibuja
// como `eq:<id>`; uno sin puertos propios es su único puerto.
export const nodoDeExtremo = (estado: EstadoRed, extremo: string): string => {
  if (prefijoDe(extremo) !== "pto") return extremo;
  const puerto = estado.puertos.find(candidato => candidato.id === extremo);
  const equipo = estado.equipos.find(candidato => candidato.id === puerto?.equipo);
  return equipo && equipo.puertos > 0 ? `eq:${equipo.id}` : extremo;
};

export const claveDePar = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const agruparEnlaces = (estado: EstadoRed): Arista[] => {
  const pares = new Map<string, Arista>();
  for (const enlace of estado.enlaces) {
    const a = nodoDeExtremo(estado, enlace.a);
    const b = nodoDeExtremo(estado, enlace.b);
    if (a === b) continue;
    const clave = claveDePar(a, b);
    const par = pares.get(clave);
    if (!par) {
      const [primero, segundo] = a < b ? [a, b] : [b, a];
      pares.set(clave, { clave, a: primero, b: segundo, tipo: enlace.tipo, cuenta: 1 });
      continue;
    }
    par.cuenta += 1;
    if (PESO[enlace.tipo] > PESO[par.tipo]) par.tipo = enlace.tipo;
  }
  return [...pares.values()];
};
