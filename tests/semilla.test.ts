import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };

test("la semilla commiteada cumple los invariantes del levantamiento", () => {
  assert.equal(semilla.racks.length, 3);
  assert.equal(semilla.equipos.filter(equipo => equipo.puertos > 0).length, 13);
  assert.equal(semilla.puertos.filter(puerto => puerto.n > 0).length, 324);
  assert.equal(semilla.espacios.length, 61);
  assert.equal(semilla.espacios.filter(espacio => espacio.estado === "operativo").length, 20);
  assert.equal(semilla.espacios.filter(espacio => espacio.estado === "solo-wifi").length, 7);
  assert.equal(semilla.espacios.filter(espacio => espacio.estado === "sin-internet").length, 7);
  assert.equal(semilla.espacios.filter(espacio => espacio.estado === "sin-verificar").length, 27);
  assert.equal(semilla.enlaces.filter(enlace => enlace.tipo === "patch" || enlace.tipo === "uplink").length, 92);
  assert.equal(semilla.enlaces.filter(enlace => enlace.tipo === "borde").length, 2);
  assert.equal(semilla.enlaces.filter(enlace => enlace.tipo === "roseta").length, 4);
  assert.equal(semilla.equipos.filter(equipo => equipo.puertos === 0).length, 7);
  assert.match(semilla.version, /^[0-9a-f]{64}$/);
});

test("todos los ids de la semilla son únicos y con el prefijo correcto", () => {
  const ids = [...semilla.puertos.map(puerto => puerto.id), ...semilla.espacios.map(espacio => espacio.id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(semilla.puertos.every(puerto => puerto.id.startsWith("pto:")));
  assert.ok(semilla.espacios.every(espacio => espacio.id.startsWith("esp:")));
});

test("cada enlace de la semilla apunta a endpoints que existen", () => {
  const conocidos = new Set([...semilla.puertos.map(puerto => puerto.id), ...semilla.espacios.map(espacio => espacio.id)]);
  for (const enlace of semilla.enlaces) {
    assert.ok(conocidos.has(enlace.a), `extremo desconocido: ${enlace.a}`);
    assert.ok(conocidos.has(enlace.b), `extremo desconocido: ${enlace.b}`);
    assert.notEqual(enlace.a, enlace.b);
  }
});
