export type TipoEquipo = "switch" | "patchpanel" | "router" | "firewall" | "ap" | "isp";
export type EstadoPuerto = "libre" | "ocupado" | "desconocido" | "dañado";
export type EstadoEspacio = "operativo" | "solo-wifi" | "sin-internet" | "sin-verificar";
// Los tipos de espacio se administran desde la interfaz y viven en net_categorias,
// así que aquí son un id libre y no una unión cerrada.
export type CategoriaEspacio = string;
export type TipoEnlace = "patch" | "uplink" | "roseta" | "borde";
export type TipoBitacora = "enlace-creado" | "enlace-borrado" | "enlaces-limpiados" | "estado-espacio" | "estado-puerto" | "nota" | "revisar" | "recurso-creado" | "recurso-editado" | "recurso-borrado" | "categoria-creada" | "categoria-editada" | "categoria-borrada";

export const tiposEquipo: TipoEquipo[] = ["switch", "patchpanel", "router", "firewall", "ap", "isp"];
export const estadosPuerto: EstadoPuerto[] = ["libre", "ocupado", "desconocido", "dañado"];
export const estadosEspacio: EstadoEspacio[] = ["operativo", "solo-wifi", "sin-internet", "sin-verificar"];
export const tiposEnlace: TipoEnlace[] = ["patch", "uplink", "roseta", "borde"];

export type Rack = { id: string; nombre: string; ubicacion: string; x: number; y: number; w: number; h: number; notas: string };
export type Equipo = { id: string; rack: string; tipo: TipoEquipo; etiqueta: string; modelo: string; puertos: number; color: string; x: number; y: number; nota: string };
export type Puerto = { id: string; equipo: string; n: number; estado: EstadoPuerto; nota: string };
export type Espacio = { id: string; nombre: string; ubicacion: string; categoria: CategoriaEspacio; estado: EstadoEspacio; x: number; y: number; nota: string };
export type Enlace = { id: number; a: string; b: string; tipo: TipoEnlace; nota: string };
export type EntradaBitacora = { id: number; fecha: string; tipo: TipoBitacora; objetivo: string; antes: string; despues: string; nota: string };
export type Cubiculo = { id: number; status: string; ip: string; mac: string; inventoryCode: string };
export type Categoria = { id: CategoriaEspacio; nombre: string; orden: number; fija: boolean };
export type EstadoRed = { racks: Rack[]; equipos: Equipo[]; puertos: Puerto[]; espacios: Espacio[]; enlaces: Enlace[]; bitacora: EntradaBitacora[]; cubiculos: Cubiculo[]; categorias: Categoria[]; orden: Record<string, number> };

// Semillas de net_categorias. Son renombrables pero no se pueden borrar: si se
// vaciara la tabla, los espacios quedarían apuntando a un tipo inexistente y los
// selectores de la ficha no tendrían ninguna opción que ofrecer.
export const CATEGORIAS_BASE: Categoria[] = [
  { id: "sala", nombre: "Sala", orden: 0, fija: true },
  { id: "oficina", nombre: "Oficina", orden: 1, fija: true },
  { id: "otro", nombre: "Otro espacio", orden: 2, fija: true },
];

export const CATEGORIA_POR_DEFECTO = "sala";

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

export const slugificar = (valor: string, respaldo = "nuevo") => valor
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 70) || respaldo;

export const idDisponible = (base: string, existentes: Set<string>) => {
  if (!existentes.has(base)) return base;
  for (let numero = 2; numero < 1000; numero += 1) {
    const candidato = `${base}-${numero}`;
    if (!existentes.has(candidato)) return candidato;
  }
  return `${base}-${Date.now()}`;
};

export const ordenarCategorias = (categorias: Categoria[]) => [...categorias]
  .sort((una, otra) => una.orden - otra.orden || una.nombre.localeCompare(otra.nombre, "es"));

export const etiquetaCategoria = (estado: EstadoRed, id: CategoriaEspacio) =>
  estado.categorias.find(categoria => categoria.id === id)?.nombre ?? id;

export const espaciosDeCategoria = (estado: EstadoRed, id: CategoriaEspacio) =>
  estado.espacios.filter(espacio => espacio.categoria === id);

// El nombre es lo que se ve; el slug es solo su identificador interno. Dos tipos
// con el mismo nombre serían indistinguibles en los selectores, así que se
// rechaza el duplicado aunque el slug quedara libre.
export const validarNombreCategoria = (
  categorias: Categoria[],
  nombre: string,
  exceptoId = "",
): { ok: true; nombre: string } | { ok: false; error: string } => {
  const limpio = nombre.trim().slice(0, 60);
  if (!limpio) return { ok: false, error: "Escribe un nombre para el tipo." };
  if (!slugificar(limpio, "")) return { ok: false, error: "El nombre necesita al menos una letra o número." };
  const normalizado = limpio.toLocaleLowerCase("es");
  const repetido = categorias.some(categoria => categoria.id !== exceptoId && categoria.nombre.toLocaleLowerCase("es") === normalizado);
  if (repetido) return { ok: false, error: "Ya existe un tipo con ese nombre." };
  return { ok: true, nombre: limpio };
};

export type PlanEliminarEspacio =
  | { ok: true; enlaces: number[]; puertosALiberar: string[] }
  | { ok: false; error: string };

// Qué se lleva por delante borrar un espacio. La ruta ejecuta este plan y la
// ficha lo usa para decir cuántas conexiones se van a perder, así que el cálculo
// vive acá y no duplicado en los dos lados.
export const planEliminarEspacio = (estado: EstadoRed, id: string): PlanEliminarEspacio => {
  if (prefijoDe(id) !== "esp") return { ok: false, error: "Ese identificador no corresponde a un espacio." };
  if (id === ID_SALA_COMPUTACION) {
    return { ok: false, error: "La Sala de Computación no se puede eliminar: es el espacio que agrupa los cubículos." };
  }
  if (!estado.espacios.some(espacio => espacio.id === id)) return { ok: false, error: "Ese espacio ya no existe." };

  const enlaces = enlacesDe(estado, id);
  const ids = new Set(enlaces.map(enlace => enlace.id));
  const puertosALiberar = enlaces
    .map(enlace => (enlace.a === id ? enlace.b : enlace.a))
    .filter(otro => prefijoDe(otro) === "pto")
    .filter(puertoId => estado.puertos.find(puerto => puerto.id === puertoId)?.estado === "ocupado")
    // Un puerto que también sirve a otro enlace sigue ocupado después del borrado.
    .filter(puertoId => !estado.enlaces.some(otro => !ids.has(otro.id) && (otro.a === puertoId || otro.b === puertoId)));

  return { ok: true, enlaces: [...ids], puertosALiberar: [...new Set(puertosALiberar)] };
};
