import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import { anchoDeTexto, codigoDeEquipo, ordenarPor, resumenDePuertos, ANCHO_MINIMO } from "../lib/red/layout.ts";
import { CATEGORIAS_BASE, type EstadoRed } from "../lib/red/modelo.ts";

const real = (): EstadoRed => ({ ...semilla, bitacora: [], cubiculos: [], categorias: CATEGORIAS_BASE, orden: {} } as unknown as EstadoRed);

test("el ancho sale del texto y nunca baja del mínimo", () => {
  assert.equal(anchoDeTexto("R2/SW1"), ANCHO_MINIMO);
  assert.equal(anchoDeTexto("PIE Administrativo"), Math.round(18 * 15 * 0.55) + 16);
});

test("el código del equipo es el id con barra", () => {
  assert.equal(codigoDeEquipo("R2-SW1"), "R2/SW1");
});

test("el resumen cuenta cada estado de puerto", () => {
  assert.deepEqual(resumenDePuertos(real(), "R2-PP2"), { total: 24, ocupados: 19, libres: 1, dañados: 0, sinVerificar: 4 });
  assert.deepEqual(resumenDePuertos(real(), "R1-PP1"), { total: 24, ocupados: 0, libres: 0, dañados: 0, sinVerificar: 24 });
});

test("sin orden guardado, ordenarPor respeta el orden automático", () => {
  assert.deepEqual(ordenarPor({}, ["b", "a", "c"]), ["b", "a", "c"]);
});

test("el orden guardado manda sobre el automático", () => {
  assert.deepEqual(ordenarPor({ a: 0, b: 1, c: 2 }, ["c", "b", "a"]), ["a", "b", "c"]);
});

// El caso del equipo agregado después de acomodar el rack: cae al final sin
// desarmar lo que ya se ordenó a mano.
test("lo que no tiene orden guardado va al final, en su orden automático", () => {
  assert.deepEqual(ordenarPor({ c: 0 }, ["a", "b", "c", "d"]), ["c", "a", "b", "d"]);
});

test("un orden guardado de un id que ya no existe no altera la lista", () => {
  assert.deepEqual(ordenarPor({ "eq:BORRADO": 0 }, ["a", "b"]), ["a", "b"]);
});
