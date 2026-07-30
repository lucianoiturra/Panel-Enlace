import { test } from "node:test";
import assert from "node:assert/strict";
import { aliasCubiculo, calza, normalizar } from "../lib/red/busqueda.ts";

test("normalizar quita acentos, grados y puntuación", () => {
  assert.equal(normalizar("3° Básico B"), "3 basico b");
  assert.equal(normalizar("Depto. Enlace"), "depto enlace");
  assert.equal(normalizar("Comedor / Casino"), "comedor casino");
  assert.equal(normalizar("  UTP   E. Media  "), "utp e media");
});

test("calza encuentra el espacio escribiendo sin el grado", () => {
  assert.equal(calza("3° Básico B", "3 basico b"), true);
  assert.equal(calza("3° Básico B", "3 básico b"), true);
});

test("calza acepta las palabras en cualquier orden", () => {
  assert.equal(calza("3° Básico B", "b 3 basico"), true);
  assert.equal(calza("Sala de Multicopiado", "multicopiado sala"), true);
});

test("calza distingue entre secciones", () => {
  assert.equal(calza("3° Básico A", "3 basico b"), false);
  assert.equal(calza("4° Básico B", "3 basico b"), false);
});

test("calza con consulta vacía no calza", () => {
  assert.equal(calza("3° Básico B", ""), false);
  assert.equal(calza("3° Básico B", "   "), false);
});

test("aliasCubiculo reconoce las formas de escribir un cubículo", () => {
  assert.equal(aliasCubiculo("cubiculo 12"), 12);
  assert.equal(aliasCubiculo("cubículo 12"), 12);
  assert.equal(aliasCubiculo("cub 12"), 12);
  assert.equal(aliasCubiculo("cub12"), 12);
  assert.equal(aliasCubiculo("c12"), 12);
  assert.equal(aliasCubiculo("12"), 12);
});

test("aliasCubiculo rechaza lo que no es un cubículo", () => {
  assert.equal(aliasCubiculo("3 basico b"), null);
  assert.equal(aliasCubiculo("cubiculo"), null);
  assert.equal(aliasCubiculo(""), null);
  assert.equal(aliasCubiculo("r2/pp1/15"), null);
});
