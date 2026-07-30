export type TipoEquipo = "switch" | "patchpanel" | "router" | "firewall" | "ap" | "isp";
export type EstadoPuerto = "libre" | "ocupado" | "desconocido" | "dañado";
export type EstadoEspacio = "operativo" | "solo-wifi" | "sin-internet" | "sin-verificar";
export type CategoriaEspacio = "sala" | "oficina" | "otro";
export type TipoEnlace = "patch" | "uplink" | "roseta" | "borde";
export type TipoBitacora = "enlace-creado" | "enlace-borrado" | "estado-espacio" | "estado-puerto" | "nota" | "revisar" | "recurso-creado" | "recurso-editado";

export const tiposEquipo: TipoEquipo[] = ["switch", "patchpanel", "router", "firewall", "ap", "isp"];
export const estadosPuerto: EstadoPuerto[] = ["libre", "ocupado", "desconocido", "dañado"];
export const estadosEspacio: EstadoEspacio[] = ["operativo", "solo-wifi", "sin-internet", "sin-verificar"];
export const categoriasEspacio: CategoriaEspacio[] = ["sala", "oficina", "otro"];
export const tiposEnlace: TipoEnlace[] = ["patch", "uplink", "roseta", "borde"];

export type Rack = { id: string; nombre: string; ubicacion: string; x: number; y: number; w: number; h: number; notas: string };
export type Equipo = { id: string; rack: string; tipo: TipoEquipo; etiqueta: string; modelo: string; puertos: number; color: string; x: number; y: number; nota: string };
export type Puerto = { id: string; equipo: string; n: number; estado: EstadoPuerto; nota: string };
export type Espacio = { id: string; nombre: string; ubicacion: string; categoria: CategoriaEspacio; estado: EstadoEspacio; x: number; y: number; nota: string };
export type Enlace = { id: number; a: string; b: string; tipo: TipoEnlace; nota: string };
export type EntradaBitacora = { id: number; fecha: string; tipo: TipoBitacora; objetivo: string; antes: string; despues: string; nota: string };
export type Cubiculo = { id: number; status: string; ip: string; mac: string; inventoryCode: string };
export type EstadoRed = { racks: Rack[]; equipos: Equipo[]; puertos: Puerto[]; espacios: Espacio[]; enlaces: Enlace[]; bitacora: EntradaBitacora[]; cubiculos: Cubiculo[]; orden: Record<string, number> };

export const etiquetasEstadoEspacio: Record<EstadoEspacio, string> = {
  operativo: "Operativo",
  "solo-wifi": "Solo Wi‑Fi",
  "sin-internet": "Sin internet",
  "sin-verificar": "Sin verificar",
};

export const etiquetasEstadoPuerto: Record<EstadoPuerto, string> = {
  libre: "Libre",
  ocupado: "Ocupado",
  desconocido: "Desconocido",
  dañado: "Dañado",
};

export const prefijoDe = (id: string): "pto" | "esp" | "cub" | null => {
  const prefijo = id.split(":")[0];
  return prefijo === "pto" || prefijo === "esp" || prefijo === "cub" ? prefijo : null;
};

export const numeroCubiculo = (id: string) => Number(id.slice(4));

export const existeEndpoint = (estado: EstadoRed, id: string) => {
  switch (prefijoDe(id)) {
    case "pto": return estado.puertos.some(puerto => puerto.id === id);
    case "esp": return estado.espacios.some(espacio => espacio.id === id);
    case "cub": return estado.cubiculos.some(cubiculo => cubiculo.id === numeroCubiculo(id));
    default: return false;
  }
};

export const etiquetaPuerto = (estado: EstadoRed, puertoId: string) => {
  const puerto = estado.puertos.find(candidato => candidato.id === puertoId);
  if (!puerto) return puertoId;
  const equipo = estado.equipos.find(candidato => candidato.id === puerto.equipo);
  if (equipo && !equipo.puertos) return equipo.etiqueta;
  return `${puerto.equipo.replace("-", "/")} p${String(puerto.n).padStart(2, "0")}`;
};

export const etiquetaEndpoint = (estado: EstadoRed, id: string) => {
  switch (prefijoDe(id)) {
    case "pto": return etiquetaPuerto(estado, id);
    case "esp": return estado.espacios.find(espacio => espacio.id === id)?.nombre ?? id;
    case "cub": return estado.cubiculos.some(cubiculo => cubiculo.id === numeroCubiculo(id)) ? `Cubículo ${numeroCubiculo(id)}` : id;
    default: return id;
  }
};

export const ordenCanonico = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export const enlacesDe = (estado: EstadoRed, id: string) => estado.enlaces.filter(enlace => enlace.a === id || enlace.b === id);

export const validarEnlace = (estado: EstadoRed, a: string, b: string): { ok: true } | { ok: false; error: string } => {
  if (a === b) return { ok: false, error: "No se puede enlazar un punto a sí mismo." };
  if (!existeEndpoint(estado, a)) return { ok: false, error: `El punto ${a} no existe.` };
  if (!existeEndpoint(estado, b)) return { ok: false, error: `El punto ${b} no existe.` };
  if (prefijoDe(a) !== "pto" && prefijoDe(b) !== "pto") {
    return { ok: false, error: "Todo enlace debe incluir al menos un puerto." };
  }
  const [primero, segundo] = ordenCanonico(a, b);
  if (estado.enlaces.some(enlace => enlace.a === primero && enlace.b === segundo)) return { ok: false, error: "Ese enlace ya existe." };
  return { ok: true };
};

export const tipoEnlaceSugerido = (estado: EstadoRed, a: string, b: string): TipoEnlace => {
  const equipoDe = (id: string) => estado.equipos.find(equipo => equipo.id === estado.puertos.find(puerto => puerto.id === id)?.equipo);
  if (prefijoDe(a) !== "pto" || prefijoDe(b) !== "pto") return "roseta";
  const primero = equipoDe(a);
  const segundo = equipoDe(b);
  if (!primero || !segundo) return "patch";
  const borde: TipoEquipo[] = ["isp", "firewall", "router"];
  if (borde.includes(primero.tipo) || borde.includes(segundo.tipo)) return "borde";
  if (primero.tipo === "switch" && segundo.tipo === "switch") return "uplink";
  return "patch";
};

export const ID_SALA_COMPUTACION = "esp:sala-computacion";

export const puertosDeEndpoint = (estado: EstadoRed, endpointId: string) => enlacesDe(estado, endpointId)
  .map(enlace => (enlace.a === endpointId ? enlace.b : enlace.a))
  .filter(otro => prefijoDe(otro) === "pto")
  .map(id => estado.puertos.find(puerto => puerto.id === id))
  .filter((puerto): puerto is Puerto => Boolean(puerto));
