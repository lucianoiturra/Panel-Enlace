import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture-red.ts";
import { cadenaComoTexto, trazarCadena } from "../lib/red/trazado.ts";

test("traza la cadena completa desde un espacio hasta el ISP", () => {
  const cadena = trazarCadena(fixture(), "esp:3-basico-b");
  assert.equal(cadena.completa, true);
  assert.deepEqual(cadena.saltos.map(salto => salto.etiqueta), [
    "3° Básico B",
    "R2/PP1 p14",
    "R2/SW1 p11",
    "R3/SW1 p02",
    "MikroTik",
    "Proveedores de Servicios de Internet",
  ]);
});

test("colapsa los saltos internos del chasis a un puerto por equipo", () => {
  const cadena = trazarCadena(fixture(), "esp:3-basico-b");
  const ids = cadena.saltos.map(salto => salto.id);
  assert.equal(ids.includes("pto:R2-SW1-p24"), false);
  assert.equal(ids.includes("pto:R3-SW1-p28"), false);
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
  assert.match(cadena.motivo ?? "", /no tiene enlaces/);
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
  assert.equal(cadenaComoTexto(cadena), "3° Básico B → R2/PP1 p14 → R2/SW1 p11 → R3/SW1 p02 → MikroTik → Proveedores de Servicios de Internet");
});

test("cadenaComoTexto marca la cadena incompleta", () => {
  const cadena = trazarCadena(fixture(), "esp:4-basico-a");
  assert.match(cadenaComoTexto(cadena), /[Ss]in puerto asignado/);
});

test("camino conserva los puertos que los saltos colapsan", () => {
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
