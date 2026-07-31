import { etiquetaPuerto, idDisponible, slugificar, type Equipo, type EstadoRed, type TipoEquipo } from "./modelo.ts";
import { ordenarPor } from "./layout.ts";

const LINEA_CANVAS = /^relación dibujada en el canvas hacia:/i;

// El segmento y los puertos identificados pueden venir en la misma línea:
// "Rack 2 — **Segmento IP:** por confirmar (…) **Puertos identificados:** …".
// Por eso se recorta el fragmento del segmento en vez de descartar la línea
// entera: descartarla se llevaría el único dato real que dejó el levantamiento.
const FRAGMENTO_SEGMENTO = /(?:rack\s*\d+\s*[—-]\s*)?\*\*segmento ip:\*\*([^*]*)/i;

export const pareceSegmento = (valor: string) => {
  const partes = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(valor.trim());
  if (!partes) return false;
  return partes.slice(1, 5).every(octeto => Number(octeto) <= 255) && Number(partes[5]) <= 32;
};

export const pareceIp = (valor: string) => {
  const partes = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(valor.trim());
  if (!partes) return false;
  return partes.slice(1, 5).every(octeto => Number(octeto) <= 255);
};

export const limpiarNotaRack = (nota: string): { notas: string; segmento: string } => {
  let segmento = "";
  const lineas = (nota ?? "").split("\n").map(linea => {
    const encontrado = FRAGMENTO_SEGMENTO.exec(linea);
    if (!encontrado) return linea;
    const candidato = (encontrado[1] ?? "").trim();
    if (!segmento && pareceSegmento(candidato)) segmento = candidato;
    return linea.replace(FRAGMENTO_SEGMENTO, " ");
  });

  const notas = lineas
    .filter(linea => !LINEA_CANVAS.test(linea.trim()))
    .map(linea => linea.replace(/\*\*/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return { notas, segmento };
};

export const SIGLAS: Record<TipoEquipo, string> = {
  switch: "SW",
  patchpanel: "PP",
  router: "RT",
  firewall: "FW",
  ap: "AP",
  isp: "ISP",
};

export const etiquetasTipoEquipo: Record<TipoEquipo, string> = {
  switch: "Switch",
  patchpanel: "Patch panel",
  router: "Router",
  firewall: "Firewall",
  ap: "Punto de acceso",
  isp: "Enlace externo",
};

export const MAXIMO_PUERTOS = 96;

export const idPuerto = (equipo: string, n: number) => `pto:${equipo}-p${n}`;

export const enumerar = (items: string[]) => items.length <= 1
  ? items.join("")
  : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

export const codigoRack = (existentes: Set<string>) => {
  for (let numero = 1; numero < 1000; numero += 1) {
    if (!existentes.has(`R${numero}`)) return `R${numero}`;
  }
  return `R${Date.now()}`;
};

// Con rack el código es correlativo por tipo dentro de ese rack (R3-SW2) porque
// es lo que está impreso en la etiqueta física del equipo. Sin rack no hay
// correlativo que signifique nada, así que cae al patrón de los AP sembrados.
export const codigoEquipo = (rack: string, tipo: TipoEquipo, etiqueta: string, existentes: Set<string>) => {
  const sigla = SIGLAS[tipo];
  if (!rack) return idDisponible(`${sigla}-${slugificar(etiqueta, sigla.toLowerCase())}`, existentes);
  for (let numero = 1; numero < 1000; numero += 1) {
    const candidato = `${rack}-${sigla}${numero}`;
    if (!existentes.has(candidato)) return candidato;
  }
  return `${rack}-${sigla}${Date.now()}`;
};

export type PlanCambioPuertos =
  | { ok: true; crear: number[]; borrar: string[] }
  | { ok: false; error: string };

export const planCambioPuertos = (estado: EstadoRed, equipoId: string, total: number): PlanCambioPuertos => {
  if (!estado.equipos.some(equipo => equipo.id === equipoId)) return { ok: false, error: "Ese equipo ya no existe." };
  if (!Number.isInteger(total) || total < 0 || total > MAXIMO_PUERTOS) {
    return { ok: false, error: `La cantidad de puertos debe ser un número entre 0 y ${MAXIMO_PUERTOS}.` };
  }

  // Un equipo sin puertos numerados conserva igual un punto de conexión, el p0,
  // para poder enlazarlo. Por eso el destino nunca es la lista vacía, y por eso
  // esta forma cubre sola el cruce del cero en los dos sentidos.
  const destino = total === 0 ? [0] : Array.from({ length: total }, (_, indice) => indice + 1);
  const numerosDestino = new Set(destino);
  const actuales = estado.puertos.filter(puerto => puerto.equipo === equipoId);
  const existentes = new Set(actuales.map(puerto => puerto.n));

  const borrar = actuales.filter(puerto => !numerosDestino.has(puerto.n)).map(puerto => puerto.id).sort();
  const crear = destino.filter(numero => !existentes.has(numero));

  const conEnlaces = borrar.filter(id => estado.enlaces.some(enlace => enlace.a === id || enlace.b === id));
  if (conEnlaces.length) {
    const nombres = conEnlaces.map(id => etiquetaPuerto(estado, id).split(" ").pop() ?? id);
    return {
      ok: false,
      error: `No se puede dejar el equipo en ${total} puertos: ${enumerar(nombres)} ${conEnlaces.length === 1 ? "conserva conexiones" : "conservan conexiones"}. Quítalas primero.`,
    };
  }

  return { ok: true, crear, borrar };
};

export type PlanEliminarEquipo =
  | { ok: true; puertos: string[]; enlaces: number[] }
  | { ok: false; error: string };

export type PlanEliminarRack =
  | { ok: true; equipos: string[]; puertos: string[]; enlaces: number[] }
  | { ok: false; error: string };

const arrastreDeEquipos = (estado: EstadoRed, equipos: string[]) => {
  const deEstos = new Set(equipos);
  const puertos = estado.puertos.filter(puerto => deEstos.has(puerto.equipo)).map(puerto => puerto.id).sort();
  const afectados = new Set(puertos);
  const enlaces = estado.enlaces
    .filter(enlace => afectados.has(enlace.a) || afectados.has(enlace.b))
    .map(enlace => enlace.id);
  return { puertos, enlaces };
};

export const planEliminarEquipo = (estado: EstadoRed, id: string): PlanEliminarEquipo => {
  if (!estado.equipos.some(equipo => equipo.id === id)) return { ok: false, error: "Ese equipo ya no existe." };
  return { ok: true, ...arrastreDeEquipos(estado, [id]) };
};

export const planEliminarRack = (estado: EstadoRed, id: string): PlanEliminarRack => {
  if (!estado.racks.some(rack => rack.id === id)) return { ok: false, error: "Ese rack ya no existe." };
  const equipos = estado.equipos.filter(equipo => equipo.rack === id).map(equipo => equipo.id).sort();
  return { ok: true, equipos, ...arrastreDeEquipos(estado, equipos) };
};

// Sin el filtro de puertos que tenía la vista: un firewall o un router asignados
// a un rack tienen cero puertos numerados y desaparecían de la pantalla.
export const equiposDeRack = (estado: EstadoRed, rack: string): Equipo[] => {
  const delRack = estado.equipos.filter(equipo => equipo.rack === rack);
  const automatico = [...delRack].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id)).map(equipo => equipo.id);
  const porId = new Map(delRack.map(equipo => [equipo.id, equipo]));
  return ordenarPor(estado.orden, automatico)
    .map(id => porId.get(id))
    .filter((equipo): equipo is Equipo => Boolean(equipo));
};
