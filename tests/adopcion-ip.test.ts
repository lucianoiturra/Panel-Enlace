import { test } from "node:test";
import assert from "node:assert/strict";
import { reconciliar, type CubiculoDoc, type DispositivoVivo } from "../lib/red/reconciliacion.ts";
import { planAdopcion } from "../lib/red/adopcion-ip.ts";

const docs: CubiculoDoc[] = [
  { id: 1, ip: "192.168.1.101", mac: "1C-83-41-1C-7D-A1", status: "operational", marca: "" },
  { id: 2, ip: "192.168.1.102", mac: "1C-83-41-1C-7D-A2", status: "operational", marca: "" },
  { id: 3, ip: "192.168.1.103", mac: "1C-83-41-1C-7D-A3", status: "operational", marca: "" },
];
const vivos: DispositivoVivo[] = [
  { mac: "1c:83:41:1c:7d:a1", ip: "192.168.1.211", nombre: "", fabricante: "", ultimaConexion: "", presente: true },
  { mac: "1c:83:41:1c:7d:a2", ip: "192.168.1.102", nombre: "", fabricante: "", ultimaConexion: "", presente: true },
];
const filas = () => reconciliar(docs, vivos).cubiculos;

test("adopta la IP real y registra la anterior", () => {
  const plan = planAdopcion(filas(), [{ id: 1, ipEsperada: "192.168.1.101" }], true);
  assert.deepEqual(plan.aplicar, [{ id: 1, ip: "192.168.1.211", antes: "192.168.1.101" }]);
  assert.deepEqual(plan.omitidos, []);
});

// El cliente dice QUÉ cubículos, nunca QUÉ valor: la IP sale siempre de la
// reconciliación que el servidor acaba de calcular.
test("un cubículo que ya no está en drift se omite", () => {
  const plan = planAdopcion(filas(), [{ id: 2, ipEsperada: "192.168.1.102" }], true);
  assert.deepEqual(plan.aplicar, []);
  assert.equal(plan.omitidos[0].id, 2);
  assert.match(plan.omitidos[0].motivo, /drift|coincide/i);
});

test("si la IP documentada cambió mientras el modal estaba abierto, se omite", () => {
  const plan = planAdopcion(filas(), [{ id: 1, ipEsperada: "192.168.1.199" }], true);
  assert.deepEqual(plan.aplicar, []);
  assert.equal(plan.omitidos[0].id, 1);
  assert.match(plan.omitidos[0].motivo, /cambió/i);
});

test("con datos viejos no se adopta nada", () => {
  const plan = planAdopcion(filas(), [{ id: 1, ipEsperada: "192.168.1.101" }], false);
  assert.deepEqual(plan.aplicar, []);
  assert.equal(plan.omitidos.length, 1);
  assert.match(plan.omitidos[0].motivo, /frescos|viejos/i);
});

test("un cubículo inexistente se omite en vez de reventar", () => {
  const plan = planAdopcion(filas(), [{ id: 99, ipEsperada: "" }], true);
  assert.deepEqual(plan.aplicar, []);
  assert.equal(plan.omitidos[0].id, 99);
});
