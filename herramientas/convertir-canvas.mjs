import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const rutaCanvas = process.argv[2] ?? "Estructura Redes CAB.canvas";
const rutaSalida = process.argv[3] ?? "lib/red/semilla.json";
const crudo = readFileSync(rutaCanvas, "utf8");
const canvas = JSON.parse(crudo);

const grupos = canvas.nodes.filter(nodo => nodo.type === "group");
const textos = canvas.nodes.filter(nodo => nodo.type === "text");
const archivos = canvas.nodes.filter(nodo => nodo.type === "file");
const porId = new Map(canvas.nodes.map(nodo => [nodo.id, nodo]));

const contenido = (nodo, grupo) => nodo.id !== grupo.id
  && nodo.x >= grupo.x && nodo.y >= grupo.y
  && nodo.x + (nodo.width ?? 0) <= grupo.x + grupo.width
  && nodo.y + (nodo.height ?? 0) <= grupo.y + grupo.height;

const contenedor = nodo => grupos
  .filter(grupo => contenido(nodo, grupo))
  .sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? null;

const slug = texto => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[°º]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const esNumero = nodo => /^\s*\d{1,2}\s*$/.test(nodo.text ?? "");
const tieneEdges = nodoId => canvas.edges.some(edge => edge.fromNode === nodoId || edge.toNode === nodoId);

const gruposRack = grupos.filter(grupo => /rack/i.test(grupo.label ?? ""));
const idRack = grupo => `R${(grupo.label.match(/rack\s*(\d)/i) ?? [])[1] ?? "0"}`;
const notasRack = new Map(gruposRack.map(grupo => [idRack(grupo), []]));
const racks = gruposRack.map(grupo => ({
  id: idRack(grupo), nombre: grupo.label.replace(/\n/g, " ").trim(),
  ubicacion: (grupo.label.split(/[-|]/)[1] ?? "").trim(),
  segmento: "",
  x: grupo.x, y: grupo.y, w: grupo.width, h: grupo.height, notas: "",
}));

const gruposEquipo = grupos.filter(grupo => /patch panel|switch/i.test(grupo.label ?? ""));
const equipos = [];
const puertos = [];
const puertoDeNodo = new Map();
const contadores = new Map();
const rackContenedor = nodo => gruposRack
  .filter(grupo => contenido(nodo, grupo))
  .sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? { label: "Rack 0" };
const idEquipo = grupo => {
  const rack = idRack(rackContenedor(grupo));
  if (/patch panel/i.test(grupo.label)) {
    const clave = `${rack}-PP`;
    const siguiente = (contadores.get(clave) ?? 0) + 1;
    contadores.set(clave, siguiente);
    return `${rack}-PP${siguiente}`;
  }
  const numero = (grupo.label.match(/switch\s*(\d)/i) ?? [])[1] ?? "1";
  return `${rack}-SW${numero}`;
};

for (const grupo of [...gruposEquipo].sort((a, b) => a.y - b.y)) {
  const id = idEquipo(grupo);
  const numeros = textos.filter(nodo => esNumero(nodo) && contenedor(nodo)?.id === grupo.id);
  const declarados = Number((grupo.label.match(/(\d+)\s*(?:puertos|p\b)/i) ?? [])[1] ?? 0);
  const maximo = numeros.reduce((mayor, nodo) => Math.max(mayor, Number(nodo.text)), 0);
  const total = declarados || maximo;
  const tipo = /patch panel/i.test(grupo.label) ? "patchpanel" : "switch";
  equipos.push({
    id, rack: id.split("-")[0], tipo,
    etiqueta: grupo.label.split("\n")[0].trim(), modelo: (grupo.label.split("\n")[1] ?? "").trim(),
    puertos: total, color: grupo.color ?? "", x: grupo.x, y: grupo.y, nota: "",
  });
  const etiquetados = new Map(numeros.map(nodo => [Number(nodo.text), nodo]));
  for (let n = 1; n <= total; n += 1) {
    const nodo = etiquetados.get(n);
    const idPuerto = `pto:${id}-p${n}`;
    if (nodo) puertoDeNodo.set(nodo.id, idPuerto);
    puertos.push({
      id: idPuerto, equipo: id, n,
      estado: nodo ? (tieneEdges(nodo.id) ? "ocupado" : "libre") : "desconocido",
      nota: nodo ? "" : "sin etiquetar en el levantamiento",
    });
  }
}

const bordes = [
  { coincide: /Fortinet/i, id: "FORTINET", tipo: "firewall", etiqueta: "Fortinet FortiGate" },
  { coincide: /MikroTik/i, id: "MIKROTIK", tipo: "router", etiqueta: "MikroTik" },
  { coincide: /Proveedores de Servicios/i, id: "ISP", tipo: "isp", etiqueta: "Proveedores de Servicios de Internet" },
];
for (const borde of bordes) {
  const nodo = archivos.find(archivo => borde.coincide.test(archivo.file));
  if (!nodo) continue;
  equipos.push({ id: borde.id, rack: "", tipo: borde.tipo, etiqueta: borde.etiqueta, modelo: "", puertos: 0, color: nodo.color ?? "", x: nodo.x, y: nodo.y, nota: "" });
  puertos.push({ id: `pto:${borde.id}-p0`, equipo: borde.id, n: 0, estado: tieneEdges(nodo.id) ? "ocupado" : "libre", nota: "" });
  puertoDeNodo.set(nodo.id, `pto:${borde.id}-p0`);
}

for (const nodo of textos.filter(texto => /^##\s*AP/i.test(texto.text ?? ""))) {
  const nombre = (nodo.text.split("\n")[1] ?? "AP").trim();
  const id = `AP-${slug(nombre)}`;
  const rack = rackContenedor(nodo);
  equipos.push({ id, rack: rack.label === "Rack 0" ? "" : idRack(rack), tipo: "ap", etiqueta: nombre, modelo: "", puertos: 0, color: nodo.color ?? "", x: nodo.x, y: nodo.y, nota: "" });
  puertos.push({ id: `pto:${id}-p0`, equipo: id, n: 0, estado: tieneEdges(nodo.id) ? "ocupado" : "libre", nota: "" });
  puertoDeNodo.set(nodo.id, `pto:${id}-p0`);
}

const grupoSalas = grupos.find(grupo => /^Salas de clases/i.test(grupo.label ?? ""));
const grupoOficinas = grupos.find(grupo => /^Oficinas/i.test(grupo.label ?? ""));
const estadoPorColor = { "1": "sin-internet", "3": "solo-wifi", "4": "operativo" };
const espacios = textos
  .filter(nodo => [grupoSalas?.id, grupoOficinas?.id].includes(contenedor(nodo)?.id))
  .map(nodo => ({
    id: `esp:${slug(nodo.text)}`,
    nombre: nodo.text.replace(/\n/g, " ").trim(),
    categoria: contenedor(nodo)?.id === grupoSalas?.id ? "sala" : "oficina",
    estado: estadoPorColor[nodo.color] ?? "sin-verificar",
    x: nodo.x, y: nodo.y, nota: "",
  }));

const enlaces = [];
const revisar = [];
const nodoDesconocido = textos.find(nodo => (nodo.text ?? "").trim() === "Desconocido");
const equipoDePuerto = idPuerto => equipos.find(equipo => equipo.id === puertos.find(puerto => puerto.id === idPuerto)?.equipo);
const tipoEntre = (a, b) => {
  const primero = equipoDePuerto(a);
  const segundo = equipoDePuerto(b);
  if (["isp", "firewall", "router"].includes(primero?.tipo) || ["isp", "firewall", "router"].includes(segundo?.tipo)) return "borde";
  if (primero?.tipo === "ap" || segundo?.tipo === "ap") return "roseta";
  if (primero?.tipo === "switch" && segundo?.tipo === "switch") return "uplink";
  return "patch";
};

for (const edge of canvas.edges) {
  const desde = porId.get(edge.fromNode);
  const hasta = porId.get(edge.toNode);
  if (!desde || !hasta) continue;

  if (nodoDesconocido && (desde.id === nodoDesconocido.id || hasta.id === nodoDesconocido.id)) {
    const otro = desde.id === nodoDesconocido.id ? hasta : desde;
    const idPuerto = puertoDeNodo.get(otro.id);
    const puerto = puertos.find(candidato => candidato.id === idPuerto);
    if (puerto) { puerto.estado = "desconocido"; puerto.nota = "destino desconocido según canvas"; }
    continue;
  }

  const a = puertoDeNodo.get(desde.id);
  const b = puertoDeNodo.get(hasta.id);
  if (a && b) { enlaces.push({ a, b, tipo: tipoEntre(a, b), nota: "" }); continue; }

  if (desde.type === "group" && b) {
    revisar.push({ objetivo: b, nota: `edge sin significado claro desde el grupo "${desde.label.split("\n")[0]}" en el canvas` });
    continue;
  }
  // Un edge que toca un grupo no dice nada que la nota del rack pueda usar: el
  // canvas los dibuja para agrupar visualmente, no para documentar un enlace.
  // Volcarlos en notas fue lo que llenó los tres racks de líneas inservibles.
}

for (const nodo of textos.filter(texto => /Segmento IP/i.test(texto.text ?? ""))) {
  const id = (nodo.text.match(/Rack\s*(\d)/i) ?? [])[1];
  const notas = notasRack.get(`R${id}`);
  if (notas) notas.push(nodo.text.replace(/\n+/g, " ").trim());
  revisar.push({ objetivo: `R${id}`, nota: "segmento IP por confirmar (detectados 192.168.20/30/60.x)" });
}
for (const rack of racks) rack.notas = (notasRack.get(rack.id) ?? []).join("\n");

const documentadas = [
  { espacio: "esp:utp-e-basica", puerto: "pto:R2-PP1-p19" },
  { espacio: "esp:pie-administrativo", puerto: "pto:R2-PP1-p18" },
];
for (const { espacio, puerto } of documentadas) {
  if (!espacios.some(candidato => candidato.id === espacio) || !puertos.some(candidato => candidato.id === puerto)) {
    throw new Error(`No se pudo enlazar la asignación documentada ${espacio} → ${puerto}: revisa los ids generados.`);
  }
  enlaces.push({ a: espacio, b: puerto, tipo: "roseta", nota: "según el canvas, sin verificar en terreno" });
  revisar.push({ objetivo: espacio, nota: `asignación tomada de la nota del canvas (${puerto}), sin verificar en terreno` });
}

const cuenta = estado => puertos.filter(puerto => puerto.estado === estado).length;
const espaciosPorEstado = estado => espacios.filter(espacio => espacio.estado === estado).length;
const enlacesPuertoPuerto = enlaces.filter(enlace => enlace.tipo === "patch" || enlace.tipo === "uplink").length;
const invariantes = [
  ["racks", racks.length, 3],
  ["equipos con puertos", equipos.filter(equipo => equipo.puertos > 0).length, 13],
  ["puertos nominales", puertos.filter(puerto => puerto.n > 0).length, 324],
  ["puertos sin etiquetar", puertos.filter(puerto => puerto.nota === "sin etiquetar en el levantamiento").length, 20],
  ["puertos con destino desconocido", puertos.filter(puerto => puerto.nota === "destino desconocido según canvas").length, 8],
  ["enlaces patch y uplink", enlacesPuertoPuerto, 92],
  ["equipos de borde y APs", equipos.filter(equipo => equipo.puertos === 0).length, 7],
  ["enlaces de borde", enlaces.filter(enlace => enlace.tipo === "borde").length, 2],
  ["enlaces roseta", enlaces.filter(enlace => enlace.tipo === "roseta").length, 4],
  ["espacios", espacios.length, 61],
  ["espacios operativo", espaciosPorEstado("operativo"), 20],
  ["espacios solo-wifi", espaciosPorEstado("solo-wifi"), 7],
  ["espacios sin-internet", espaciosPorEstado("sin-internet"), 7],
  ["espacios sin-verificar", espaciosPorEstado("sin-verificar"), 27],
];
const fallas = invariantes.filter(([, real, esperado]) => real !== esperado);
if (fallas.length) {
  for (const [nombre, real, esperado] of fallas) console.error(`invariante "${nombre}": ${real}, se esperaba ${esperado}`);
  process.exit(1);
}

const semilla = {
  version: createHash("sha256").update(crudo).digest("hex"),
  origen: `${rutaCanvas} (2026-06-06)`,
  generado: new Date().toISOString(),
  racks, equipos, puertos, espacios, enlaces, revisar,
};
writeFileSync(rutaSalida, `${JSON.stringify(semilla, null, 2)}\n`);
console.log(`semilla escrita en ${rutaSalida}: ${racks.length} racks, ${equipos.length} equipos, ${puertos.length} puertos, ${espacios.length} espacios, ${enlaces.length} enlaces, ${revisar.length} por revisar`);
console.log(`puertos: ${cuenta("ocupado")} ocupados, ${cuenta("libre")} libres, ${cuenta("desconocido")} desconocidos`);
