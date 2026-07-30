import { test } from "node:test";
import assert from "node:assert/strict";
import { idsValidos, MAXIMO_IDS } from "../lib/red/orden.ts";

test("una lista de ids válida vuelve limpia", () => {
  assert.deepEqual(idsValidos(["R1", " R2 ", "eq:R2-SW1"]), ["R1", "R2", "eq:R2-SW1"]);
});

test("lo que no es una lista con contenido se rechaza", () => {
  assert.equal(idsValidos(undefined), null);
  assert.equal(idsValidos("R1"), null);
  assert.equal(idsValidos([]), null);
});

test("se rechaza una lista más larga que el máximo", () => {
  assert.equal(idsValidos(Array.from({ length: MAXIMO_IDS + 1 }, (_, i) => `id-${i}`)), null);
});

test("se rechaza un id que no es texto, que está vacío o que es demasiado largo", () => {
  assert.equal(idsValidos(["R1", 2]), null);
  assert.equal(idsValidos(["R1", "   "]), null);
  assert.equal(idsValidos(["R1", "x".repeat(121)]), null);
});

// Un id repetido dejaría dos filas peleando por la misma posición.
test("se rechaza una lista con ids repetidos", () => {
  assert.equal(idsValidos(["R1", "R2", "R1"]), null);
});
