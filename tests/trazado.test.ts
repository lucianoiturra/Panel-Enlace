import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture-red.ts";
import { agruparCadenaPorEquipo, cadenaComoTexto, origenDeCircuito, trazarCadena, trazarCircuito } from "../lib/red/trazado.ts";

test("traza la cadena completa desde un espacio hasta el ISP", () => {
  const cadena = trazarCadena(fixture(), "esp:3-basico-b");
  assert.equal(cadena.completa, true);
  assert.deepEqual(cadena.saltos.map(salto => salto.etiqueta), [
    "3° Básico B",
    "R2/PP1 p14",
    "R2/SW1 p11",
    "R2/SW1 p24",
    "R3/SW1 p02",
    "R3/SW1 p28",
    "MikroTik",
    "Proveedores de Servicios de Internet",
  ]);
});

test("conserva los puertos de entrada y salida de cada equipo", () => {
  const cadena = trazarCadena(fixture(), "esp:3-basico-b");
  const ids = cadena.saltos.map(salto => salto.id);
  assert.equal(ids.includes("pto:R2-SW1-p24"), true);
  assert.equal(ids.includes("pto:R3-SW1-p28"), true);
  assert.equal(ids.some(id => id.startsWith("eq:")), false);
});

test("no cruza un patch panel de un puerto a otro", () => {
  const estado = fixture();
  estado.enlaces.push({ id: 6, a: "esp:secretaria", b: "pto:R2-PP1-p15", tipo: "roseta", nota: "" });
  const cadena = trazarCadena(estado, "esp:secretaria");
  assert.equal(cadena.completa, false);
  assert.deepEqual(cadena.saltos.map(salto => salto.etiqueta), ["Secretaría", "R2/PP1 p15"]);
});

test("un puerto sin enlaces reporta cadena incompleta sin lanzar", () => {
  const cadena = trazarCadena(fixture(), "pto:R2-PP1-p16");
  assert.equal(cadena.completa, false);
  assert.equal(cadena.saltos.length, 1);
  assert.match(cadena.motivo ?? "", /no tiene conexiones registradas/);
});

test("un puerto libre de switch no salta internamente hacia otros puertos conectados", () => {
  const estado = fixture();
  estado.puertos.push({ id: "pto:R2-SW1-p7", equipo: "R2-SW1", n: 7, estado: "libre", nota: "" });
  const cadena = trazarCircuito(estado, "pto:R2-SW1-p7");
  assert.equal(cadena.completa, false);
  assert.deepEqual(cadena.saltos.map(salto => salto.id), ["pto:R2-SW1-p7"]);
  assert.deepEqual(cadena.camino, ["pto:R2-SW1-p7"]);
  assert.match(cadena.motivo ?? "", /no tiene conexiones registradas/);
});

test("después de limpiar todos los enlaces ningún puerto inventa un tramo por el chasis", () => {
  const estado = fixture();
  estado.enlaces = [];
  const cadena = trazarCircuito(estado, "pto:R2-SW1-p11");
  assert.deepEqual(cadena.saltos.map(salto => salto.id), ["pto:R2-SW1-p11"]);
  assert.equal(cadena.alcanzables.size, 1);
});

test("un espacio sin roseta reporta cadena incompleta", () => {
  const cadena = trazarCadena(fixture(), "esp:4-basico-a");
  assert.equal(cadena.completa, false);
  assert.match(cadena.motivo ?? "", /[Ss]in puerto asignado/);
});

test("un endpoint inexistente devuelve cadena vacía sin lanzar", () => {
  const cadena = trazarCadena(fixture(), "esp:no-existe");
  assert.equal(cadena.completa, false);
  assert.deepEqual(cadena.saltos, []);
});

test("un ciclo de uplinks no cuelga ni repite nodos", () => {
  const estado = fixture();
  estado.puertos.push({ id: "pto:R3-SW1-p27", equipo: "R3-SW1", n: 27, estado: "ocupado", nota: "" });
  estado.puertos.push({ id: "pto:R2-SW1-p23", equipo: "R2-SW1", n: 23, estado: "ocupado", nota: "" });
  estado.enlaces.push({ id: 7, a: "pto:R2-SW1-p23", b: "pto:R3-SW1-p27", tipo: "uplink", nota: "" });
  const cadena = trazarCadena(estado, "esp:3-basico-b");
  assert.equal(cadena.completa, true);
  const ids = cadena.saltos.map(salto => salto.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("traza desde un cubículo", () => {
  const estado = fixture();
  estado.enlaces.push({ id: 8, a: "cub:12", b: "pto:R2-PP1-p15", tipo: "roseta", nota: "" });
  estado.enlaces.push({ id: 9, a: "pto:R2-PP1-p15", b: "pto:R2-SW1-p11", tipo: "patch", nota: "" });
  const cadena = trazarCadena(estado, "cub:12");
  assert.equal(cadena.completa, true);
  assert.equal(cadena.saltos[0].etiqueta, "Cubículo 12");
  assert.equal(cadena.saltos[0].tipo, "cubiculo");
});

test("cadenaComoTexto une los saltos con flechas", () => {
  const cadena = trazarCadena(fixture(), "esp:3-basico-b");
  assert.equal(cadenaComoTexto(cadena), "Proveedores de Servicios de Internet → MikroTik → R3/SW1 p28 → R3/SW1 p02 → R2/SW1 p24 → R2/SW1 p11 → R2/PP1 p14 → 3° Básico B");
});

test("agrupa visualmente entrada y salida de cada switch en orden desde el ISP", () => {
  const estado = fixture();
  const cadena = trazarCadena(estado, "esp:3-basico-b");
  const grupos = agruparCadenaPorEquipo(estado, cadena);
  const r3 = grupos.find(grupo => grupo.clave === "equipo:R3-SW1");
  const r2 = grupos.find(grupo => grupo.clave === "equipo:R2-SW1");
  assert.deepEqual(r3?.ids, ["pto:R3-SW1-p28", "pto:R3-SW1-p02"]);
  assert.equal(r3?.detalle, "entrada p28 → salida p2");
  assert.deepEqual(r2?.ids, ["pto:R2-SW1-p24", "pto:R2-SW1-p11"]);
  assert.equal(r2?.detalle, "entrada p24 → salida p11");
});

test("cadenaComoTexto marca la cadena incompleta", () => {
  const cadena = trazarCadena(fixture(), "esp:4-basico-a");
  assert.match(cadenaComoTexto(cadena), /[Ss]in puerto asignado/);
});

test("camino conserva también los nodos virtuales internos", () => {
  const cadena = trazarCadena(fixture(), "esp:3-basico-b");
  assert.equal(cadena.camino.includes("pto:R2-SW1-p24"), true);
  assert.equal(cadena.camino.includes("pto:R3-SW1-p28"), true);
  assert.equal(cadena.camino.some(id => id.startsWith("eq:")), true);
  assert.equal(cadena.camino[0], "esp:3-basico-b");
  assert.equal(cadena.camino[cadena.camino.length - 1], "pto:ISP-p0");
});

test("alcanzables cubre todo lo visitado, no solo la ruta", () => {
  const estado = fixture();
  estado.enlaces.push({ id: 6, a: "esp:secretaria", b: "pto:R2-PP1-p15", tipo: "roseta", nota: "" });
  estado.enlaces.push({ id: 7, a: "pto:R2-PP1-p15", b: "pto:R2-SW1-p24", tipo: "patch", nota: "" });
  const cadena = trazarCadena(estado, "esp:3-basico-b");
  assert.equal(cadena.completa, true);
  assert.equal(cadena.alcanzables.has("esp:secretaria"), true);
  assert.equal(cadena.camino.includes("esp:secretaria"), false);
});

test("alcanzables excluye el ISP cuando el parcheo no está documentado", () => {
  const estado = fixture();
  estado.enlaces = estado.enlaces.filter(enlace => enlace.id !== 5);
  const cadena = trazarCadena(estado, "esp:3-basico-b");
  assert.equal(cadena.completa, false);
  assert.equal(cadena.alcanzables.has("pto:ISP-p0"), false);
  assert.equal(cadena.alcanzables.has("pto:R3-SW1-p28"), true);
});

test("un endpoint inexistente devuelve camino y alcanzables vacíos", () => {
  const cadena = trazarCadena(fixture(), "esp:no-existe");
  assert.deepEqual(cadena.camino, []);
  assert.equal(cadena.alcanzables.size, 0);
});

test("una ruta incompleta se detiene en la troncal y no salta a otra sala", () => {
  const estado = fixture();
  estado.enlaces = estado.enlaces.filter(enlace => enlace.id !== 4 && enlace.id !== 5);
  estado.equipos.push({ id: "AP-OTRA-SALA", rack: "R3", tipo: "ap", etiqueta: "AP otra sala", marca: "", modelo: "", ipGestion: "", puertos:0, color: "", x: 0, y: 0, nota: "" });
  estado.puertos.push({ id: "pto:AP-OTRA-SALA-p0", equipo: "AP-OTRA-SALA", n: 0, estado: "ocupado", nota: "" });
  estado.enlaces.push({ id: 6, a: "pto:R3-SW1-p28", b: "pto:AP-OTRA-SALA-p0", tipo: "roseta", nota: "" });
  const cadena = trazarCadena(estado, "esp:3-basico-b");
  assert.equal(cadena.completa, false);
  assert.equal(cadena.saltos.at(-1)?.id, "pto:R3-SW1-p28");
  assert.equal(cadena.saltos.some(salto => salto.id === "pto:AP-OTRA-SALA-p0"), false);
});

test("seleccionar el puerto de un AP enfoca el circuito hasta ese AP", () => {
  const estado = fixture();
  estado.equipos.push({ id: "AP-SALA", rack: "R2", tipo: "ap", etiqueta: "AP Sala", marca: "", modelo: "", ipGestion: "", puertos:0, color: "", x: 0, y: 0, nota: "" });
  estado.puertos.push({ id: "pto:AP-SALA-p0", equipo: "AP-SALA", n: 0, estado: "ocupado", nota: "" });
  estado.enlaces.push({ id: 6, a: "pto:R2-SW1-p11", b: "pto:AP-SALA-p0", tipo: "roseta", nota: "" });
  assert.equal(origenDeCircuito(estado, "pto:R2-SW1-p11"), "pto:AP-SALA-p0");
  const cadena = trazarCircuito(estado, "pto:R2-SW1-p11");
  assert.equal(cadena.completa, true);
  assert.equal(cadena.saltos[0]?.id, "pto:AP-SALA-p0");
  assert.equal(cadena.camino.includes("pto:R2-SW1-p11"), true);
});

test("si falta el último parcheo sigue los uplinks hacia el rack de borde", () => {
  const estado = fixture();
  estado.enlaces = estado.enlaces.filter(enlace => ![3, 4, 5].includes(enlace.id));
  estado.racks.push({ id: "R1", nombre: "Rack 1", ubicacion: "Sala Enlace", segmento: "", x: 0, y: 0, w: 0, h: 0, notas: "" });
  estado.equipos.push(
    { id: "R1-SW1", rack: "R1", tipo: "switch", etiqueta: "Switch 1", marca: "", modelo: "", ipGestion: "", puertos:24, color: "", x: 0, y: 0, nota: "" },
    { id: "R1-PP1", rack: "R1", tipo: "patchpanel", etiqueta: "Patch 1", marca: "", modelo: "", ipGestion: "", puertos:24, color: "", x: 0, y: 0, nota: "" },
    { id: "FORTINET", rack: "", tipo: "firewall", etiqueta: "Fortinet", marca: "", modelo: "", ipGestion: "", puertos:0, color: "", x: 0, y: 0, nota: "" },
  );
  estado.puertos.push(
    { id: "pto:R1-SW1-p23", equipo: "R1-SW1", n: 23, estado: "ocupado", nota: "" },
    { id: "pto:R1-PP1-p23", equipo: "R1-PP1", n: 23, estado: "ocupado", nota: "" },
    { id: "pto:FORTINET-p0", equipo: "FORTINET", n: 0, estado: "ocupado", nota: "" },
  );
  estado.enlaces.push(
    { id: 6, a: "pto:R1-SW1-p23", b: "pto:R2-SW1-p24", tipo: "uplink", nota: "" },
    { id: 7, a: "pto:FORTINET-p0", b: "pto:R1-PP1-p23", tipo: "borde", nota: "" },
    { id: 8, a: "pto:FORTINET-p0", b: "pto:ISP-p0", tipo: "borde", nota: "" },
  );
  const cadena = trazarCadena(estado, "esp:3-basico-b");
  assert.equal(cadena.completa, false);
  assert.equal(cadena.saltos.at(-1)?.id, "pto:R1-SW1-p23");
  assert.match(cadena.motivo ?? "", /R1\/SW1 p23/);
});

test("seleccionar Fortinet conserva a la vez su lado ISP y su lado de distribución", () => {
  const estado = fixture();
  estado.equipos.push(
    { id: "FORTINET", rack: "", tipo: "firewall", etiqueta: "Fortinet FortiGate", marca: "", modelo: "", ipGestion: "", puertos:0, color: "", x: 0, y: 0, nota: "" },
    { id: "R1-PP1", rack: "R2", tipo: "patchpanel", etiqueta: "Patch 1", marca: "", modelo: "", ipGestion: "", puertos:24, color: "", x: 0, y: 0, nota: "" },
  );
  estado.puertos.push(
    { id: "pto:FORTINET-p0", equipo: "FORTINET", n: 0, estado: "ocupado", nota: "" },
    { id: "pto:R1-PP1-p23", equipo: "R1-PP1", n: 23, estado: "ocupado", nota: "" },
  );
  estado.enlaces.push(
    { id: 6, a: "pto:FORTINET-p0", b: "pto:ISP-p0", tipo: "borde", nota: "" },
    { id: 7, a: "pto:FORTINET-p0", b: "pto:R1-PP1-p23", tipo: "borde", nota: "" },
  );
  const circuito = trazarCircuito(estado, "pto:FORTINET-p0");
  assert.deepEqual(circuito.saltos.map(salto => salto.id), [
    "pto:R1-PP1-p23",
    "pto:FORTINET-p0",
    "pto:ISP-p0",
  ]);
  assert.equal(circuito.caminos.some(camino => camino.includes("pto:R1-PP1-p23") && camino.includes("pto:ISP-p0")), true);
});

test("un puerto de salida del switch alcanza el ISP por otro puerto del mismo chasis", () => {
  const circuito = trazarCircuito(fixture(), "pto:R2-SW1-p11");
  assert.equal(circuito.completa, true);
  assert.equal(circuito.camino.includes("pto:R2-SW1-p24"), true);
  assert.equal(circuito.camino.at(-1), "pto:ISP-p0");
});
